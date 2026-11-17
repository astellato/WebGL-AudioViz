// @vitest-environment jsdom
/*
    StartGate.isolation.test.js - the gate must not leak presses into the app.

    Mounts a real StartGate next to the real GestureController and
    KeyboardController and the real App handlers, wired exactly as
    App.finishInit wires them (body / window / document), so the containment
    policy is tested against the consumers that actually exist.

    Copyright © 2021 Anthony Stellato
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartGate } from '../../scripts/app/StartGate.js';
import { GestureController } from '../../scripts/app/GestureController.js';
import { KeyboardController } from '../../scripts/app/KeyboardController.js';

const AUDIO_STORAGE_KEY = 'audioviz.audio.v1';

function makeStorage(source) {
    const data = new Map([[AUDIO_STORAGE_KEY, JSON.stringify({ source })]]);
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: vi.fn() };
}

/**
 * A stand-in receiver for the real App methods: it records what the handlers
 * actually do (transport commands, debug toggles, stats panels) without
 * needing a renderer, an AudioContext or a scene.
 */
function makeAppReceiver() {
    const calls = [];
    return {
        calls,
        initialized: false,
        begin: vi.fn(() => Promise.resolve(true)),
        setAudioSource: vi.fn(() => Promise.resolve(true)),
        debug: true,
        showOverlay: false,
        platformMobile: false,
        stats: { showPanel: (i) => calls.push(`stats:${i}`) },
        gui: null,
        state: null,
        isGuiFocused: () => false,
        restartMusic() { calls.push('restart'); },
        pauseResumeMusic() { calls.push('pause'); },
        showDebugOverlay() { calls.push('debug-on'); this.showOverlay = true; },
        hideDebugOverlay() { calls.push('debug-off'); this.showOverlay = false; },
        showStats() { calls.push('stats-on'); },
        hideStats() { calls.push('stats-off'); },
        onKeyUp: (event) => AppProto.onKeyUp.call(receiver, event),
        onDoubleClick: () => AppProto.onDoubleClick.call(receiver),
    };
}

let AppProto;
let receiver;
let gate;
let root;
let gestures;
let keyboard;
let intents;

function makeActions() {
    intents = [];
    return new Proxy({}, {
        get(_, name) {
            if (name === 'setAudioSource') return (input) => { intents.push(`source:${input}`); return receiver.setAudioSource(input); };
            return () => intents.push(String(name));
        },
    });
}

function installConsumers() {
    const actions = makeActions();

    gestures = new GestureController({
        element: document.body,
        actions,
        isInteractive: (target) => !!(target && target.closest && (target.closest('#gui') || target.closest('#gui-toggle'))),
    });
    keyboard = new KeyboardController({
        actions,
        isGuiFocused: () => false,
    });
    document.addEventListener('dblclick', receiver.onDoubleClick);
    window.addEventListener('keyup', receiver.onKeyUp);
}

function uninstallConsumers() {
    if (gestures) gestures.dispose();
    if (keyboard) keyboard.dispose();
    document.removeEventListener('dblclick', receiver.onDoubleClick);
    window.removeEventListener('keyup', receiver.onKeyUp);
}

function touch(element, type, { x = 0, y = 0, cancelable = true } = {}) {
    const event = new Event(type, { bubbles: true, cancelable });
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
    Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
    element.dispatchEvent(event);
    return event;
}

function keydown(element, code, extra = {}) {
    return element.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));
}

function keyup(element, code) {
    return element.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
}

function click(element, detail = 0) {
    return element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
}

beforeEach(async () => {
    document.body.innerHTML = '<div id="audio-hint"></div><div id="gui"></div>';
    localStorage.clear();

    // Load the real App class body for its unmodified onKeyUp/onDoubleClick.
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

    receiver = makeAppReceiver();
    installConsumers();

    root = document.getElementById('audio-hint');
    gate = new StartGate({ app: receiver, root, storage: makeStorage(3), canMic: true, canTab: true });
    gate.mount();
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
});

const primary = () => root.querySelector('button[data-primary="true"]');

describe('StartGate isolation - touch gestures', () => {
    it('a swipe that crosses a gate button produces no intent and is not default-prevented', () => {
        const button = primary();

        touch(button, 'touchstart', { x: 10, y: 200 });
        const start = touch(document.body, 'touchstart', { x: 10, y: 200 });
        const move = touch(button, 'touchmove', { x: 10, y: 60 });
        const end = touch(button, 'touchend', { x: 10, y: 60 });

        expect(start.defaultPrevented).toBe(false);
        expect(move.defaultPrevented).toBe(false);
        expect(end.defaultPrevented).toBe(false);
        expect(intents).toEqual([]);
        expect(receiver.begin).not.toHaveBeenCalled();
    });

    it('a swipe that stays off the gate still drives the app and is prevented while tracking', () => {
        const canvas = document.createElement('div');
        document.body.appendChild(canvas);

        touch(canvas, 'touchstart', { x: 10, y: 200 });
        const move = touch(canvas, 'touchmove', { x: 10, y: 60 });
        touch(canvas, 'touchend', { x: 10, y: 60 });

        expect(move.defaultPrevented).toBe(true);
        expect(intents).toEqual(['variant-next']);
    });

    it('a cancelled canvas gesture followed by a drag on the gate does not complete the stale gesture', () => {
        const canvas = document.createElement('div');
        document.body.appendChild(canvas);

        // Start on the visuals, cancel by starting a second finger, then drag
        // across the gate button: nothing may reach the body controller.
        touch(canvas, 'touchstart', { x: 10, y: 200 });
        touch(canvas, 'touchend', { x: 10, y: 200 });

        const button = primary();
        touch(button, 'touchstart', { x: 10, y: 200 });
        touch(button, 'touchmove', { x: 10, y: 60 });
        touch(button, 'touchend', { x: 10, y: 60 });

        expect(intents).toEqual([]);
    });
});

describe('StartGate isolation - keyboard', () => {
    it('Space and Enter on the gate run no transport command', () => {
        const button = primary();

        keyup(button, 'Space');
        keyup(button, 'Enter');

        expect(receiver.calls).toEqual([]);
    });

    it('Space and Enter with focus off the gate still run their commands', () => {
        keyup(document.body, 'Space');
        keyup(document.body, 'Enter');

        expect(receiver.calls).toEqual(['pause', 'restart']);
    });

    it('arrow, D and H keydown on the gate fire no shortcut', () => {
        const button = primary();

        for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyD', 'KeyH']) {
            keydown(button, code);
        }

        expect(intents).toEqual([]);
    });

    it('arrow, D and H keydown off the gate still fire their shortcuts', () => {
        for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyD', 'KeyH']) {
            keydown(document.body, code);
        }

        expect(intents).toEqual([
            'scene-next', 'scene-prev', 'variant-prev', 'variant-next', 'drift-toggle', 'gui-toggle',
        ]);
    });
});

describe('StartGate isolation - double click and activation', () => {
    it('double click on the gate does not toggle playback', () => {
        primary().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

        expect(receiver.calls).toEqual([]);
    });

    it('double click off the gate still toggles playback', () => {
        document.body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

        expect(receiver.calls).toEqual(['pause']);
    });

    it('a keyboard-synthesised click makes one attempt and runs no transport command', () => {
        const button = primary();

        keydown(button, 'Enter');
        keyup(button, 'Enter');
        click(button, 0);

        expect(receiver.begin).toHaveBeenCalledTimes(1);
        expect(receiver.begin).toHaveBeenCalledWith(3);
        expect(receiver.calls).toEqual([]);
    });
});
