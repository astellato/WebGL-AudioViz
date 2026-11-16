// @vitest-environment jsdom
/*
    AppGuards.test.js - the App behaviour the gate is allowed to rely on.

    The bootstrap tests use a fake App, so this file pins the real one: the
    pre-init begin guard, the reload begin that still initialises after a
    failure, persistence only on success, two overlapping source switches, and
    the synchronous AudioContext unlock. If these ever change, the fake is no
    longer a faithful stand-in.

    Copyright © 2021 Anthony Stellato
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AUDIO_STORAGE_KEY = 'audioviz.audio.v1';
const AUDIOINPUTS = { NONE: 0, DEFAULT: 1, MIC: 2, TAB: 3, DROPMP3: 4 };

const state = vi.hoisted(() => ({
    setSource: [],
    pending: [],
    resume: 0,
}));

function makeAudioHandlerMock() {
    return class FakeAudioHandler {
        constructor() {
            this.listener = { context: {} };
            this.analyzer = { getBeat: () => ({}), setDrawEnabled() {} };
            this.onSourceEnded = null;
        }

        resumeAudioContext() {
            state.resume += 1;
        }

        setSource(input) {
            state.setSource.push(input);
            return new Promise((resolve) => {
                state.pending.push({ input, resolve });
            });
        }

        getOutput() {
            return {};
        }

        getSource() {
            return AUDIOINPUTS.NONE;
        }

        isPlaying() {
            return false;
        }
    };
}

function storedSource() {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    return raw ? JSON.parse(raw).source : null;
}

function settle(index, result) {
    const entry = state.pending[index];
    state.pending.splice(index, 1);
    entry.resolve(result);
}

const tick = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

let App;
let app;

beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = '';
    state.setSource.length = 0;
    state.pending.length = 0;
    state.resume = 0;

    vi.resetModules();
    vi.doMock('three', () => ({
        Clock: class { getDelta() { return 0; } },
        WebGLRenderer: class {},
        Vector3: class {},
    }));
    vi.doMock('three/addons/libs/stats.module.js', () => ({ default: class {} }));
    vi.doMock('../../scripts/audio/AudioHandler.js', () => ({
        AUDIOINPUTS,
        AudioHandler: makeAudioHandlerMock(),
    }));
    vi.doMock('../../scripts/scenes/index.js', () => ({ SCENE_DEFINITIONS: [] }));
    vi.doMock('../../scripts/Utils.js', async (importOriginal) => {
        const actual = await importOriginal();
        return { ...actual, hasWebGL2: () => true, hasTabAudioCapture: () => true };
    });

    const module = await import('../../scripts/app/App.js');
    App = module.App;
    app = new App();
    // The renderer, stats and scene graph are irrelevant to these guards.
    app.finishInit = vi.fn();
});

afterEach(() => {
    vi.doUnmock('three');
    vi.doUnmock('three/addons/libs/stats.module.js');
    vi.doUnmock('../../scripts/audio/AudioHandler.js');
    vi.doUnmock('../../scripts/scenes/index.js');
    vi.doUnmock('../../scripts/Utils.js');
    vi.restoreAllMocks();
});

describe('App.begin guards', () => {
    it('a second begin while the first is pending returns false without acquiring again', async () => {
        const first = app.begin(AUDIOINPUTS.MIC);
        await tick();
        expect(state.setSource).toEqual([AUDIOINPUTS.MIC]);

        const second = await app.begin(AUDIOINPUTS.DEFAULT);

        expect(second).toBe(false);
        expect(state.setSource).toEqual([AUDIOINPUTS.MIC]);

        settle(0, { ok: true });
        await expect(first).resolves.toBe(true);
    });

    it('a reload begin that fails still initialises and stores nothing', async () => {
        expect(document.getElementById('overlay')).toBeNull();

        const pending = app.begin(AUDIOINPUTS.TAB);
        await tick();
        settle(0, { ok: false });

        await expect(pending).resolves.toBe(false);
        expect(app.initialized).toBe(true);
        expect(app.finishInit).toHaveBeenCalledTimes(1);
        expect(storedSource()).toBeNull();
    });

    it('a first-visit begin that fails keeps the app uninitialised and stores nothing', async () => {
        const overlay = document.createElement('div');
        overlay.id = 'overlay';
        document.body.appendChild(overlay);

        const pending = app.begin(AUDIOINPUTS.MIC);
        await tick();
        settle(0, { ok: false });

        await expect(pending).resolves.toBe(false);
        expect(app.initialized).toBe(false);
        expect(app.finishInit).not.toHaveBeenCalled();
        expect(storedSource()).toBeNull();
    });

    it('a begin after a failed reload begin is refused with no acquisition', async () => {
        const pending = app.begin(AUDIOINPUTS.TAB);
        await tick();
        settle(0, { ok: false });
        await pending;

        const again = await app.begin(AUDIOINPUTS.DEFAULT);

        expect(again).toBe(false);
        expect(state.setSource).toEqual([AUDIOINPUTS.TAB]);
        expect(app.finishInit).toHaveBeenCalledTimes(1);
    });

    it('a successful begin persists the source', async () => {
        const pending = app.begin(AUDIOINPUTS.MIC);
        await tick();
        settle(0, { ok: true });
        await pending;

        expect(storedSource()).toBe(AUDIOINPUTS.MIC);
    });

    it('the AudioContext unlock happens synchronously inside the calling gesture', () => {
        app.begin(AUDIOINPUTS.DEFAULT);

        // Synchronous: the resume already happened and the source acquisition
        // started before this call returned.
        expect(state.resume).toBe(1);
        expect(state.setSource).toEqual([AUDIOINPUTS.DEFAULT]);
    });
});

describe('App.setAudioSource', () => {
    it('returns false with no acquisition when there is no audio handler', async () => {
        await expect(app.setAudioSource(AUDIOINPUTS.MIC)).resolves.toBe(false);
        expect(state.setSource).toEqual([]);
    });

    it('is unguarded: two overlapping switches each reach the handler, and only successes persist', async () => {
        // Enter the app first so a handler exists.
        const started = app.begin(AUDIOINPUTS.DEFAULT);
        await tick();
        settle(0, { ok: true });
        await started;
        expect(app.initialized).toBe(true);

        state.setSource.length = 0;

        const first = app.setAudioSource(AUDIOINPUTS.MIC);
        const second = app.setAudioSource(AUDIOINPUTS.TAB);
        await tick();

        expect(state.setSource).toEqual([AUDIOINPUTS.MIC, AUDIOINPUTS.TAB]);

        // Both reached the handler; the last success wins in storage.
        settle(0, { ok: true });
        settle(0, { ok: true });

        await expect(first).resolves.toBe(true);
        await expect(second).resolves.toBe(true);
        expect(storedSource()).toBe(AUDIOINPUTS.TAB);
    });

    it('a failed switch persists nothing', async () => {
        const started = app.begin(AUDIOINPUTS.DEFAULT);
        await tick();
        settle(0, { ok: true });
        await started;
        localStorage.clear();

        const attempt = app.setAudioSource(AUDIOINPUTS.MIC);
        await tick();
        settle(0, { ok: false });

        await expect(attempt).resolves.toBe(false);
        expect(storedSource()).toBeNull();
    });
});
