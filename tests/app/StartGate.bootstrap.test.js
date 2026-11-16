// @vitest-environment jsdom
/*
    StartGate.bootstrap.test.js - characterization of the real reload bootstrap.

    Loads the real scripts/AudioSphere.js (with a fake App and capability flags)
    against the real index.html body, and asserts only DOM and call counts. The
    same file is therefore expected to fail against the old bootstrap and pass
    against the gate, and a correct gate module with stale bootstrap wiring still
    fails. It deliberately never imports StartGate.

    Copyright © 2021 Anthony Stellato
*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GUIController } from '../../scripts/app/GUIController.js';

const H = vi.hoisted(() => ({
    app: null,
    pending: [],
    capabilities: { canMic: true, canTab: true, canWebGL2: true },
    windowRecords: [],
}));

vi.mock('../../scripts/app/App.js', () => {
    class FakeApp {
        constructor() {
            this.initialized = false;
            this._beginPending = false;
            this.dispatches = 0;
            this.acquisitions = [];
            H.app = this;
        }

        _acquire(kind, input) {
            this.acquisitions.push(input);
            return new Promise((resolve) => {
                H.pending.push({ kind, input, resolve });
            });
        }

        begin(input) {
            this.dispatches++;
            if (this.initialized || this._beginPending) return Promise.resolve(false);
            this._beginPending = true;
            return this._acquire('begin', input);
        }

        setAudioSource(input) {
            this.dispatches++;
            // App.js:386 - without an audio handler the switch cannot run.
            if (!this.initialized) return Promise.resolve(false);
            return this._acquire('setAudioSource', input);
        }
    }
    return { App: FakeApp };
});

vi.mock('../../scripts/Utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        hasMicrophone: () => H.capabilities.canMic,
        hasTabAudioCapture: () => H.capabilities.canTab,
        hasWebGL2: () => H.capabilities.canWebGL2,
    };
});

// jsdom rewrites import.meta.url to an http URL, so resolve from the project
// root that Vitest runs in instead.
const PAGE_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function installPage() {
    const match = PAGE_HTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = match ? match[1] : '';
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function interceptWindow() {
    const records = H.windowRecords;
    records.length = 0;
    const add = window.addEventListener;
    const remove = window.removeEventListener;

    window.addEventListener = function (type, listener, options) {
        records.push({ type, listener, options, live: true });
        return add.call(this, type, listener, options);
    };
    window.removeEventListener = function (type, listener, options) {
        for (const record of records) {
            if (record.type === type && record.listener === listener) record.live = false;
        }
        return remove.call(this, type, listener, options);
    };

    return {
        restore() {
            for (const record of records) {
                if (record.live) remove.call(window, record.type, record.listener, record.options);
            }
            window.addEventListener = add;
            window.removeEventListener = remove;
        },
    };
}

function rememberSource(source) {
    localStorage.setItem('audioviz.audio.v1', JSON.stringify({ source }));
}

function storedSource() {
    const raw = localStorage.getItem('audioviz.audio.v1');
    return raw ? JSON.parse(raw).source : null;
}

function macrotask() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settle(ok = true) {
    const entry = H.pending.shift();
    if (!entry) {
        await macrotask();
        return false;
    }
    if (entry.kind === 'begin') {
        H.app._beginPending = false;
        // App.js:118-119 - a reload begin still finishes initialisation on failure.
        H.app.initialized = true;
    }
    entry.resolve(ok);
    await macrotask();
    return true;
}

function buttonFor(source) {
    return document.querySelector(`#audio-hint button[data-source="${source}"]`);
}

function tapTarget() {
    return document.querySelector('#audio-hint button[data-primary="true"]')
        || document.getElementById('audio-hint');
}

function tap(target) {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function acquisitionsOf(source) {
    return H.app.acquisitions.filter((value) => value === source).length;
}

const guiState = {
    drift: { enabled: false, speedSeconds: 60, scope: 'visualizers' },
    sceneIndex: 0,
    getVariantIndex: () => 0,
};

let windowRecorder;

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    H.app = null;
    H.pending.length = 0;
    H.capabilities = { canMic: true, canTab: true, canWebGL2: true };
    vi.resetModules();
    installPage();
    rememberSource(3);
    windowRecorder = interceptWindow();
});

afterEach(() => {
    windowRecorder.restore();
    vi.resetModules();
});

describe('reload start gate - real bootstrap', () => {
    it('AC1 offers Default, Mic and Tab as source buttons before any gesture', async () => {
        await import('../../scripts/AudioSphere.js');

        const sources = [...document.querySelectorAll('#audio-hint button[data-source]')]
            .map((button) => button.dataset.source);

        expect(sources).toEqual(['1', '2', '3']);
        expect(H.app.dispatches).toBe(0);
    });

    it('AC1 marks the remembered Tab as primary without starting audio on load', async () => {
        await import('../../scripts/AudioSphere.js');

        const primaries = document.querySelectorAll('#audio-hint button[data-primary="true"]');
        expect(primaries).toHaveLength(1);
        expect(primaries[0].dataset.source).toBe('3');
        expect(H.app.dispatches).toBe(0);
        expect(H.app.acquisitions).toEqual([]);
    });

    it('AC1 exposes a polite status region before any gesture', async () => {
        await import('../../scripts/AudioSphere.js');

        const status = document.querySelector('#audio-hint [data-gate-status]');
        expect(status).not.toBeNull();
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
    });

    it('AC2 choosing Mic dispatches only Mic, never the remembered Tab', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(buttonFor(2) || tapTarget());

        expect(H.app.dispatches).toBe(1);
        expect(acquisitionsOf(2)).toBe(1);
        expect(acquisitionsOf(3)).toBe(0);
        expect(storedSource()).toBe(3);
    });

    it('AC2 a failed alternate attempt leaves the remembered Tab primary and storage unchanged', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(buttonFor(2) || tapTarget());
        await settle(false);

        expect(buttonFor(2)).not.toBeNull();
        expect(document.querySelector('#audio-hint button[data-primary="true"]').dataset.source).toBe('3');
        expect(storedSource()).toBe(3);
        expect(acquisitionsOf(2)).toBe(1);
    });

    it('AC3 unrelated pointer, click, key and touch events after a failure do not acquire again', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(tapTarget());
        await settle(false);
        const acquisitionsBefore = H.app.acquisitions.length;

        for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) {
            document.body.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        }

        expect(H.app.acquisitions.length).toBe(acquisitionsBefore);
        expect(acquisitionsOf(3)).toBe(1);
    });

    it('AC3 GUI pointer, click and key events do not re-acquire; a change acquires the selection once', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(tapTarget());
        await settle(false);

        new GUIController({
            root: document.getElementById('gui'),
            state: guiState,
            actions: { setAudioSource: (input) => H.app.setAudioSource(input) },
            lineup: [],
            getDebugState: () => ({}),
            getAudioState: () => ({ source: 1, tabSupported: true }),
        });

        const select = document.getElementById('gui-source');
        select.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        select.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        select.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }));

        expect(acquisitionsOf(3)).toBe(1);

        select.value = '2';
        select.dispatchEvent(new Event('change'));

        expect(acquisitionsOf(2)).toBe(1);
    });

    it('AC6 pointerdown and click are one dispatch and one acquisition before init', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(tapTarget());

        expect(H.app.dispatches).toBe(1);
        expect(H.app.acquisitions).toEqual([3]);
    });

    it('AC6 touchstart then click are one dispatch and one acquisition', async () => {
        await import('../../scripts/AudioSphere.js');

        const target = tapTarget();
        target.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(H.app.dispatches).toBe(1);
        expect(H.app.acquisitions).toEqual([3]);
    });

    it('AC6 a second click while the first attempt is pending does not dispatch again', async () => {
        await import('../../scripts/AudioSphere.js');

        const target = tapTarget();
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(H.app.dispatches).toBe(1);
        expect(H.app.acquisitions).toEqual([3]);
    });

    it('AC6 a pointerdown that settles before the click still yields one dispatch and one acquisition', async () => {
        await import('../../scripts/AudioSphere.js');

        const target = tapTarget();
        target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        // Nothing is queued on the gate path, so this is a no-op there; on the
        // old bootstrap it settles the pointerdown's own acquisition.
        await settle(false);

        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(H.app.dispatches).toBe(1);
        expect(H.app.acquisitions).toEqual([3]);
    });

    it('AC4/AC6 an initialized retry is one dispatch and one acquisition, with a retry marker', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(tapTarget());
        await settle(false);

        expect(document.querySelector('#audio-hint button[data-retry="true"]')).not.toBeNull();

        const dispatchesBefore = H.app.dispatches;
        const acquisitionsBefore = H.app.acquisitions.length;
        tap(tapTarget());

        expect(H.app.dispatches - dispatchesBefore).toBe(1);
        expect(H.app.acquisitions.length - acquisitionsBefore).toBe(1);
        expect(acquisitionsOf(3)).toBe(2);
    });

    it('AC4 a failure keeps every source offered with an explicit retry on the primary', async () => {
        await import('../../scripts/AudioSphere.js');

        tap(tapTarget());
        await settle(false);

        const sources = [...document.querySelectorAll('#audio-hint button[data-source]')]
            .map((button) => button.dataset.source);
        expect(sources).toEqual(['1', '2', '3']);

        const primaries = document.querySelectorAll('#audio-hint button[data-primary="true"]');
        expect(primaries).toHaveLength(1);
        expect(primaries[0].dataset.retry).toBe('true');
    });

    it('AC5 remembered Tab without tab capture resolves to Default and omits the Tab button', async () => {
        H.capabilities.canTab = false;
        await import('../../scripts/AudioSphere.js');

        const sources = [...document.querySelectorAll('#audio-hint button[data-source]')]
            .map((button) => button.dataset.source);
        expect(sources).toEqual(['1', '2']);

        const primary = document.querySelector('#audio-hint button[data-primary="true"]');
        expect(primary.dataset.source).toBe('1');
    });

    it('D2s the bootstrap registers no window-level listener', async () => {
        await import('../../scripts/AudioSphere.js');

        const live = H.windowRecords.filter((record) => record.live);
        expect(live.map((record) => record.type)).toEqual([]);
    });

    it('control: a bare click starts the remembered Tab once through begin', async () => {
        await import('../../scripts/AudioSphere.js');

        tapTarget().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(H.app.dispatches).toBe(1);
        expect(H.app.acquisitions).toEqual([3]);
    });

    it('control: nothing remembered keeps the original overlay', async () => {
        localStorage.clear();
        await import('../../scripts/AudioSphere.js');

        expect(document.getElementById('overlay')).not.toBeNull();
        expect(document.getElementById('startButton')).not.toBeNull();
        expect(document.getElementById('audio-hint').style.display).not.toBe('block');
        expect(H.app.dispatches).toBe(0);
    });

    it('control: a device without WebGL2 keeps the original overlay', async () => {
        H.capabilities.canWebGL2 = false;
        await import('../../scripts/AudioSphere.js');

        expect(document.getElementById('overlay')).not.toBeNull();
        expect(H.app.dispatches).toBe(0);
    });

    it('control: success retires the gate and later clicks do nothing', async () => {
        await import('../../scripts/AudioSphere.js');

        tapTarget().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await settle(true);

        expect(document.getElementById('audio-hint').style.display).toBe('none');

        const dispatches = H.app.dispatches;
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(H.app.dispatches).toBe(dispatches);
    });
});
