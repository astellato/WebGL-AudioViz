// @vitest-environment jsdom
/*
    StartGate.retirement.test.js - success, release and chord ownership.

    Covers the F1 succession-before-release case and the r3 M1 cases: a press
    that began on the gate must never reach the app, while a fresh press after
    success must keep its ordinary meaning. Propagation is observed on both
    halves of every key (keydown and keyup), because App.onKeyUp listens for
    keyup only - a test that counted pauses alone would pass a gate that
    swallows the new press and prove nothing.

    Copyright © 2021 Anthony Stellato
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartGate } from '../../scripts/app/StartGate.js';
import { KeyboardController } from '../../scripts/app/KeyboardController.js';

const AUDIO_STORAGE_KEY = 'audioviz.audio.v1';

function makeStorage(source) {
    const data = new Map([[AUDIO_STORAGE_KEY, JSON.stringify({ source })]]);
    return {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: vi.fn((key, value) => data.set(key, value)),
    };
}

function makeReceiver({ initialized = false, manual = false } = {}) {
    const resolvers = [];
    const receiver = {
        initialized,
        dispatches: [],
        calls: [],
        // Propagation seen by the real consumers (window keydown/keyup).
        propagated: [],
        // The real App handlers, called on this receiver so their unmodified
        // bodies (App.js:307-327) run exactly as they do in the app.
        onKeyUp(event) { return AppProto.onKeyUp.call(receiver, event); },
        onDoubleClick() { return AppProto.onDoubleClick.call(receiver); },
        isGuiFocused: () => false,
        debug: true,
        showOverlay: false,
        platformMobile: false,
        gui: null,
        state: null,
        stats: { showPanel: (i) => receiver.calls.push(`stats:${i}`) },
        begin: vi.fn((input) => {
            receiver.dispatches.push(['begin', input]);
            if (manual) return new Promise((resolve) => resolvers.push(resolve));
            return Promise.resolve(true);
        }),
        setAudioSource: vi.fn((input) => {
            receiver.dispatches.push(['setAudioSource', input]);
            if (manual) return new Promise((resolve) => resolvers.push(resolve));
            return Promise.resolve(true);
        }),
        restartMusic() { receiver.calls.push('restart'); },
        pauseResumeMusic() { receiver.calls.push('pause'); },
        showDebugOverlay() { receiver.calls.push('debug-on'); receiver.showOverlay = true; },
        hideDebugOverlay() { receiver.calls.push('debug-off'); receiver.showOverlay = false; },
        showStats() { receiver.calls.push('stats-on'); },
        hideStats() { receiver.calls.push('stats-off'); },
        resolveAll(value) {
            while (resolvers.length > 0) resolvers.shift()(value);
        },
    };
    return receiver;
}

let AppProto;
let receiver;
let gate;
let root;
let keyboard;
let intents;
let windowKeydown;
let windowKeyup;
let installed = [];

function installConsumers() {
    uninstallConsumers();
    intents = [];
    const actions = new Proxy({}, {
        get(_, name) {
            return () => intents.push(String(name));
        },
    });
    keyboard = new KeyboardController({ actions, isGuiFocused: () => false });

    // The two listeners App.finishInit installs that matter for keys, plus the
    // real App.onKeyUp body, exactly as App.js:213-215 wires them.
    windowKeydown = (event) => receiver.propagated.push(`down:${event.code}`);
    windowKeyup = (event) => {
        receiver.propagated.push(`up:${event.code}`);
        receiver.onKeyUp(event);
    };
    window.addEventListener('keydown', windowKeydown);
    window.addEventListener('keyup', windowKeyup);
    installed.push(['keydown', windowKeydown], ['keyup', windowKeyup]);
}

function uninstallConsumers() {
    if (keyboard) {
        keyboard.dispose();
        keyboard = null;
    }
    for (const [type, listener] of installed) window.removeEventListener(type, listener);
    installed = [];
}

async function mountGate({ remembered = 3, manual = false, initialized = false } = {}) {
    receiver = makeReceiver({ manual, initialized });
    installConsumers();
    root = document.createElement('div');
    root.id = 'audio-hint';
    document.body.appendChild(root);
    gate = new StartGate({
        app: receiver, root, storage: makeStorage(remembered), canMic: true, canTab: true,
    });
    gate.mount();
    return gate;
}

const tick = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const primary = () => root.querySelector('button[data-primary="true"]');
const buttonFor = (source) => root.querySelector(`button[data-source="${source}"]`);

function down(element, code, extra = {}) {
    return element.dispatchEvent(new KeyboardEvent('keydown', {
        code, bubbles: true, cancelable: true, ...extra,
    }));
}

function up(element, code) {
    return element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code }));
}

function click(element) {
    return element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function acquisitions() {
    return receiver.dispatches.length;
}

beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.clear();

    vi.resetModules();
    vi.doMock('three', () => ({
        Clock: class { getDelta() { return 0; } },
        WebGLRenderer: class {},
        Vector3: class {},
    }));
    vi.doMock('three/addons/libs/stats.module.js', () => ({ default: class {} }));
    vi.doMock('../../scripts/audio/AudioHandler.js', () => ({
        AUDIOINPUTS: { NONE: 0, DEFAULT: 1, MIC: 2, TAB: 3, DROPMP3: 4 },
        AudioHandler: class {},
    }));
    vi.doMock('../../scripts/scenes/index.js', () => ({ SCENE_DEFINITIONS: [] }));
    const module = await import('../../scripts/app/App.js');
    AppProto = module.App.prototype;
});

afterEach(() => {
    if (gate) gate.dispose();
    uninstallConsumers();
    vi.useRealTimers();
    vi.doUnmock('three');
    vi.doUnmock('three/addons/libs/stats.module.js');
    vi.doUnmock('../../scripts/audio/AudioHandler.js');
    vi.doUnmock('../../scripts/scenes/index.js');
    vi.restoreAllMocks();
    gate = null;
});

describe('F1 success before release', () => {
    it('Enter down, click, success before keyup: same attached button, one dispatch, zero transport', async () => {
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const button = primary();
        button.focus();
        expect(document.activeElement).toBe(button);

        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();

        expect(gate.state).toBe('STARTED');
        expect(document.activeElement).toBe(button);
        expect(button.isConnected).toBe(true);
        expect(root.contains(button)).toBe(true);
        expect(receiver.dispatches).toEqual([['begin', 3]]);

        // Release after success must not restart the track or reach the app.
        up(button, 'Enter');
        await macrotask();

        expect(receiver.calls).toEqual([]);
        expect(receiver.propagated).not.toContain('up:Enter');
    });

    it('cleanup happens only after the later task, never synchronously', async () => {
        vi.useFakeTimers();
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const button = primary();
        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();

        expect(gate.state).toBe('STARTED');
        expect(root.dataset.retiring).toBe('true');
        expect(button.isConnected).toBe(true);

        up(button, 'Enter');
        // Still attached in the same task: the native target must survive the
        // default action that follows the release.
        expect(button.isConnected).toBe(true);
        expect(root.style.display).not.toBe('none');

        vi.runAllTimers();
        await tick();

        expect(root.style.display).toBe('none');
        expect(root.innerHTML).toBe('');
    });

    it('a repeat outside the root still held stays gate-owned', async () => {
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const button = primary();
        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();

        down(document.body, 'Enter', { repeat: true });
        await tick();

        expect(receiver.calls).toEqual([]);
        expect(receiver.propagated).not.toContain('down:Enter');
    });

    it('the terminal native click on the retained button is a no-op', async () => {
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const button = primary();
        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();

        const before = acquisitions();
        click(button);
        await tick();

        expect(acquisitions()).toBe(before);
        expect(receiver.calls).toEqual([]);
    });
});

describe('M1 lost release', () => {
    async function startWithLostEnterRelease() {
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const button = primary();
        button.focus();
        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();

        expect(gate.state).toBe('STARTED');
        return button;
    }

    it('a fresh Space down and up after a lost Enter release reaches the app on both halves', async () => {
        const button = await startWithLostEnterRelease();

        down(button, 'Space');
        up(button, 'Space');
        await macrotask();

        expect(receiver.propagated).toContain('down:Space');
        expect(receiver.propagated).toContain('up:Space');
        expect(receiver.calls).toEqual(['pause']);
        expect(acquisitions()).toBe(1);
    });

    it('fresh arrow, D and H presses after a lost release fire their shortcuts exactly once', async () => {
        const button = await startWithLostEnterRelease();

        for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyD', 'KeyH']) {
            down(button, code);
            up(button, code);
        }
        await macrotask();

        expect(intents).toEqual([
            'scene-next', 'scene-prev', 'variant-prev', 'variant-next', 'drift-toggle', 'gui-toggle',
        ]);
        expect(receiver.calls).toEqual([]);
        expect(acquisitions()).toBe(1);
    });

    it('a fresh same-code Enter press is independent, restarts once and drains the old lease', async () => {
        vi.useFakeTimers();
        const button = await startWithLostEnterRelease();
        const documentRemove = vi.spyOn(document, 'removeEventListener');

        down(document.body, 'Enter');
        up(document.body, 'Enter');
        vi.runAllTimers();
        await tick();

        expect(receiver.calls).toEqual(['restart']);
        expect(receiver.propagated).toContain('down:Enter');
        expect(receiver.propagated).toContain('up:Enter');
        expect(acquisitions()).toBe(1);

        const pairRemovals = documentRemove.mock.calls.filter(([, , capture]) => capture === true);
        expect(pairRemovals.length).toBeGreaterThanOrEqual(2);
        expect(root.style.display).toBe('none');
    });

    it('no fresh press or release is ever default-prevented', async () => {
        const button = await startWithLostEnterRelease();

        const spaceDown = down(button, 'Space');
        const spaceUp = up(button, 'Space');
        await macrotask();

        expect(spaceDown).toBe(true);
        expect(spaceUp).toBe(true);
    });

    it('a fresh press performs no storage write', async () => {
        const button = await startWithLostEnterRelease();
        const storage = gate.storage;

        down(button, 'Space');
        up(button, 'Space');
        await macrotask();

        expect(storage.setItem).not.toHaveBeenCalled();
    });
});

describe('M1 post-success chord', () => {
    async function ready(manual = true) {
        receiver = makeReceiver({ manual });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();
        return primary();
    }

    it('Enter held through success, fresh Space pressed at the retained button, then Enter up, then Space up', async () => {
        const button = await ready();

        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();
        expect(gate.state).toBe('STARTED');

        // Fresh Space while Enter is still held: independent, so it propagates.
        down(button, 'Space');
        expect(receiver.propagated).toContain('down:Space');

        // Enter release drains, then Space release must still be ordinary. The
        // release goes to whatever holds focus, which is the body once the
        // retained subtree is gone - never the detached button.
        up(button, 'Enter');
        await macrotask();
        const releaseTarget = document.activeElement || document.body;
        up(releaseTarget, 'Space');
        await macrotask();

        expect(receiver.propagated).toContain('down:Space');
        expect(receiver.propagated).toContain('up:Space');
        expect(receiver.calls).toEqual(['pause']);
        expect(receiver.calls).not.toContain('restart');
        expect(acquisitions()).toBe(1);
    });

    it('Space released before Enter: still exactly one ordinary pause', async () => {
        const button = await ready();

        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();
        expect(gate.state).toBe('STARTED');

        down(button, 'Space');
        up(button, 'Space');
        expect(receiver.propagated).toContain('down:Space');
        expect(receiver.propagated).toContain('up:Space');

        up(button, 'Enter');
        await macrotask();

        expect(receiver.calls).toEqual(['pause']);
        expect(acquisitions()).toBe(1);
    });

    it('a Space held before success and released after is gate-owned: zero pause', async () => {
        const button = await ready();
        button.focus();

        // Space is pressed on the gate before the attempt starts, so it is
        // gate-owned; Enter then starts audio.
        down(button, 'Space');
        down(button, 'Enter');
        click(button);
        await tick();
        receiver.resolveAll(true);
        await tick();
        expect(gate.state).toBe('STARTED');

        up(button, 'Enter');
        up(button, 'Space');
        await macrotask();

        expect(receiver.calls).toEqual([]);
        expect(receiver.propagated).not.toContain('up:Space');
        expect(receiver.propagated).not.toContain('down:Space');
        expect(acquisitions()).toBe(1);
    });
});

/*
    R1: a gate-owned release can be retargeted outside the retained root - the
    normal case once a picker or permission prompt takes focus, or the user
    tabs away. Only the document capture keyup listener can contain it there,
    so the app's window keyup consumer must never see it.
*/
describe('R1 out-of-root release containment', () => {
    async function startWithHeldRelease({ initialized = false } = {}) {
        // Press on the gate, activate it, and let success settle while the key
        // is still held: the release is then owed by the gate.
        await mountGate({ manual: !initialized, initialized });
        const button = primary();
        button.focus();
        down(button, 'Enter');
        click(button);
        await tick();
        if (!initialized) {
            receiver.resolveAll(true);
            await tick();
        }
        expect(gate.state).toBe('STARTED');
        return button;
    }

    it('a held release dispatched at document.body after success is contained', async () => {
        const button = await startWithHeldRelease();

        const notPrevented = up(document.body, 'Enter');
        await macrotask();

        expect(notPrevented).toBe(true);
        // The app's keyup consumer is on window: the release must not reach it.
        expect(receiver.propagated).not.toContain('up:Enter');
        expect(receiver.calls).toEqual([]);
        expect(receiver.dispatches).toEqual([['begin', 3]]);
        expect(acquisitions()).toBe(1);
        // The lease drains once the release is accounted for.
        expect(root.style.display).toBe('none');
        expect(root.innerHTML).toBe('');
        expect(button.isConnected).toBe(false);
    });

    it('a held release at a node that is neither the root nor a descendant is contained', async () => {
        await startWithHeldRelease();
        const elsewhere = document.createElement('div');
        document.body.appendChild(elsewhere);

        const notPrevented = up(elsewhere, 'Enter');
        await macrotask();

        expect(notPrevented).toBe(true);
        expect(receiver.propagated).not.toContain('up:Enter');
        expect(receiver.calls).toEqual([]);
        expect(receiver.dispatches).toEqual([['begin', 3]]);
        expect(acquisitions()).toBe(1);
        expect(root.style.display).toBe('none');
    });

    it('an initialized retry contains a held release outside the root after immediate success', async () => {
        // setAudioSource resolves at once here, so success settles inside the
        // click microtask with Enter still held.
        await startWithHeldRelease({ initialized: true });

        const notPrevented = up(document.body, 'Enter');
        await macrotask();

        expect(notPrevented).toBe(true);
        expect(receiver.propagated).not.toContain('up:Enter');
        expect(receiver.calls).toEqual([]);
        expect(receiver.dispatches).toEqual([['setAudioSource', 3]]);
        expect(acquisitions()).toBe(1);
        expect(root.style.display).toBe('none');
    });
});

/*
    R1: before success a repeat of a still-held code is still gate-owned. The
    existing repeat case covers only the post-success state; these cover
    WAITING and ATTEMPTING, where the attempt has not settled yet.
*/
describe('R1 out-of-root repeat before success', () => {
    it('a repeat outside the root while WAITING stays gate-owned', async () => {
        await mountGate({ manual: true });
        down(primary(), 'Enter');
        expect(gate.state).toBe('WAITING');

        const notPrevented = down(document.body, 'Enter', { repeat: true });
        await tick();

        expect(notPrevented).toBe(true);
        expect(receiver.propagated).not.toContain('down:Enter');
        expect(receiver.calls).toEqual([]);
        expect(receiver.dispatches).toEqual([]);
        expect(intents).toEqual([]);
        expect(gate.state).toBe('WAITING');
    });

    it('a repeat outside the root while the attempt is pending stays gate-owned', async () => {
        await mountGate({ manual: true });
        const button = primary();
        down(button, 'Enter');
        click(button);
        await tick();
        expect(gate.state).toBe('ATTEMPTING');

        const notPrevented = down(document.body, 'Enter', { repeat: true });
        await tick();

        expect(notPrevented).toBe(true);
        expect(receiver.propagated).not.toContain('down:Enter');
        expect(receiver.calls).toEqual([]);
        expect(receiver.dispatches).toEqual([['begin', 3]]);
        expect(intents).toEqual([]);
        expect(gate.state).toBe('ATTEMPTING');
    });
});

describe('continuation lease lifetime', () => {
    it('the pair exists only while a gate press is outstanding', async () => {
        receiver = makeReceiver({ manual: true });
        installConsumers();
        root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        const add = vi.spyOn(document, 'addEventListener');
        const winAdd = vi.spyOn(window, 'addEventListener');

        down(primary(), 'Enter');
        expect(add.mock.calls.filter(([, , capture]) => capture === true).map(([type]) => type).sort())
            .toEqual(['keydown', 'keyup']);

        up(primary(), 'Enter');
        await macrotask();

        expect(gate.state).toBe('WAITING');
        // Only the consumers installed by this test file are on window - the
        // gate itself must never register there.
        expect(winAdd.mock.calls.map(([type]) => type)).not.toContain('pointerdown');
        expect(winAdd.mock.calls.map(([type]) => type)).not.toContain('touchstart');
    });

    it('a lost release on the normal (non-gate) path cannot swallow later keys', async () => {
        const button = await (async () => {
            receiver = makeReceiver();
            installConsumers();
            root = document.createElement('div');
            root.id = 'audio-hint';
            document.body.appendChild(root);
            gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
            gate.mount();
            const primaryButton = primary();
            down(primaryButton, 'Enter');
            click(primaryButton);
            await tick();
            return primaryButton;
        })();

        // No keyup at all for Enter; the app must still see later keys.
        down(document.body, 'Space');
        up(document.body, 'Space');
        await macrotask();

        expect(receiver.propagated).toContain('down:Space');
        expect(receiver.propagated).toContain('up:Space');
        expect(receiver.calls).toEqual(['pause']);
        expect(receiver.calls).not.toContain('restart');
    });
});
