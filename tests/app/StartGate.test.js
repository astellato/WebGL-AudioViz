// @vitest-environment jsdom
/*
    StartGate.test.js - unit coverage for the reload start gate module.

    Exercises the state machine, the DOM contract, the accessibility
    attributes and the listener/lease lifetimes without any of the app's real
    consumers, so a failure points at the gate itself.

    Copyright © 2021 Anthony Stellato
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartGate, ISOLATED_EVENTS } from '../../scripts/app/StartGate.js';

const AUDIO_STORAGE_KEY = 'audioviz.audio.v1';

function makeStorage(source) {
    const data = new Map();
    if (source !== null && source !== undefined) data.set(AUDIO_STORAGE_KEY, JSON.stringify({ source }));
    return {
        getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
        setItem: vi.fn((key, value) => data.set(key, value)),
        removeItem: vi.fn((key) => data.delete(key)),
    };
}

/**
 * @param {object} options
 * @param {boolean} [options.initialized] retry path when true
 * @param {boolean} [options.outcome] value the attempt settles with
 * @param {boolean} [options.manual] leave attempts pending until resolved
 * @param {boolean} [options.throws] throw synchronously from the App call
 */
function makeApp({ initialized = false, outcome = true, manual = false, throws = false } = {}) {
    const resolvers = [];
    const app = {
        initialized,
        beginCalls: [],
        setCalls: [],
        begin: vi.fn((input) => {
            app.beginCalls.push(input);
            if (throws) throw new Error('synchronous failure');
            if (manual) return new Promise((resolve) => resolvers.push(resolve));
            return Promise.resolve(outcome);
        }),
        setAudioSource: vi.fn((input) => {
            app.setCalls.push(input);
            if (throws) throw new Error('synchronous failure');
            if (manual) return new Promise((resolve) => resolvers.push(resolve));
            return Promise.resolve(outcome);
        }),
        resolveAll(value) {
            while (resolvers.length > 0) resolvers.shift()(value);
        },
    };
    return app;
}

let roots = [];
let gates = [];

function mountGate({
    remembered = 3, canMic = true, canTab = true, app = makeApp(), storage = makeStorage(remembered),
} = {}) {
    const root = document.createElement('div');
    root.id = 'audio-hint';
    document.body.appendChild(root);
    roots.push(root);
    const gate = new StartGate({ app, root, storage, canMic, canTab });
    gates.push(gate);
    gate.mount();
    return { gate, root, app, storage };
}

const tick = async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

function sourceButtons(root) {
    return [...root.querySelectorAll('button[data-source]')];
}

function primaryButton(root) {
    return root.querySelector('button[data-primary="true"]');
}

function clickSource(root, source) {
    const button = root.querySelector(`button[data-source="${source}"]`);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    return event;
}

function keydown(element, code, extra = {}) {
    return element.dispatchEvent(new KeyboardEvent('keydown', {
        code, bubbles: true, cancelable: true, ...extra,
    }));
}

function keyup(element, code, extra = {}) {
    return element.dispatchEvent(new KeyboardEvent('keyup', {
        code, bubbles: true, cancelable: true, ...extra,
    }));
}

beforeEach(() => {
    roots = [];
    gates = [];
    document.body.innerHTML = '';
    localStorage.clear();
});

afterEach(() => {
    // Disposing closes any document-level lease, so a listener cannot leak
    // into the next test and make a later assertion pass for the wrong reason.
    for (const gate of gates) gate.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const root of roots) root.remove();
});

describe('StartGate - mount and DOM contract', () => {
    it('mount shows the supported sources in order with the remembered source primary', () => {
        const { root, app } = mountGate({ remembered: 3, canTab: true });

        expect(sourceButtons(root).map((button) => button.dataset.source)).toEqual(['1', '2', '3']);
        expect(primaryButton(root).dataset.source).toBe('3');
        expect(app.beginCalls).toEqual([]);
        expect(app.setCalls).toEqual([]);
        expect(root.style.display).toBe('block');
        expect(root.dataset.state).toBe('WAITING');
    });

    it('mount offers Default and Mic but not Tab when tab capture is unsupported', () => {
        const { root } = mountGate({ remembered: 3, canTab: false });

        expect(sourceButtons(root).map((button) => button.dataset.source)).toEqual(['1', '2']);
        expect(primaryButton(root).dataset.source).toBe('1');
    });

    it('mount falls back to Default when nothing usable is remembered', () => {
        const { root } = mountGate({ remembered: null });

        expect(primaryButton(root).dataset.source).toBe('1');
    });

    it('the status line is a polite live region with content', () => {
        const { root } = mountGate();
        const status = root.querySelector('[data-gate-status]');

        expect(status).not.toBeNull();
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.textContent.trim().length).toBeGreaterThan(0);
    });

    it('mount attaches exactly one click listener and the isolated listeners, to the root only', () => {
        const root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        roots.push(root);

        const rootAdd = vi.spyOn(root, 'addEventListener');
        const windowAdd = vi.spyOn(window, 'addEventListener');
        const documentAdd = vi.spyOn(document, 'addEventListener');
        const bodyAdd = vi.spyOn(document.body, 'addEventListener');

        new StartGate({ app: makeApp(), root, storage: makeStorage(3), canMic: true, canTab: true }).mount();

        const types = rootAdd.mock.calls.map(([type]) => type);
        expect(types).toContain('click');
        for (const type of ISOLATED_EVENTS) expect(types).toContain(type);
        expect(types).toHaveLength(1 + ISOLATED_EVENTS.length);
        expect(windowAdd).not.toHaveBeenCalled();
        expect(documentAdd).not.toHaveBeenCalled();
        expect(bodyAdd).not.toHaveBeenCalled();
    });

    it('mounting twice adds no listeners and preserves an in-flight attempt', async () => {
        const app = makeApp({ manual: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();
        expect(gate.state).toBe('ATTEMPTING');

        const rootAdd = vi.spyOn(root, 'addEventListener');
        gate.mount();

        expect(rootAdd).not.toHaveBeenCalled();
        expect(gate.state).toBe('ATTEMPTING');
        expect(sourceButtons(root)).toHaveLength(3);
    });

    it('mounting after success is a no-op that does not re-show the gate', async () => {
        const app = makeApp({ outcome: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();
        expect(gate.state).toBe('STARTED');
        expect(root.style.display).toBe('none');

        gate.mount();
        expect(root.style.display).toBe('none');
        expect(root.querySelectorAll('button')).toHaveLength(0);
    });
});

describe('StartGate - attempts', () => {
    it('a click on the remembered primary starts it through begin once', async () => {
        const app = makeApp();
        const { root, storage } = mountGate({ app });

        clickSource(root, 3);
        await tick();

        expect(app.beginCalls).toEqual([3]);
        expect(app.setCalls).toEqual([]);
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('an initialized app retries through setAudioSource instead of begin', async () => {
        const app = makeApp({ initialized: true });
        const { root } = mountGate({ app });

        clickSource(root, 3);
        await tick();

        expect(app.beginCalls).toEqual([]);
        expect(app.setCalls).toEqual([3]);
    });

    it('choosing another source dispatches that source, not the remembered one', async () => {
        const app = makeApp();
        const { root } = mountGate({ app, remembered: 3 });

        clickSource(root, 2);
        await tick();

        expect(app.beginCalls).toEqual([2]);
    });

    it('a second click while the first attempt is pending dispatches nothing more', async () => {
        const app = makeApp({ manual: true });
        const { root } = mountGate({ app });

        clickSource(root, 3);
        await tick();
        clickSource(root, 3);
        await tick();

        expect(app.beginCalls).toEqual([3]);
    });

    it('the App call is not awaited: the attempt is visible before the promise settles', () => {
        const app = makeApp({ manual: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);

        expect(gate.state).toBe('ATTEMPTING');
        expect(app.beginCalls).toEqual([3]);
        expect(root.getAttribute('aria-busy')).toBe('true');
    });

    it('a rejected attempt ends in FAILED with every source still offered', async () => {
        const app = makeApp();
        app.begin.mockImplementation(() => Promise.reject(new Error('denied')));
        const { gate, root, storage } = mountGate({ app });

        clickSource(root, 3);
        await tick();

        expect(gate.state).toBe('FAILED');
        expect(root.dataset.state).toBe('FAILED');
        expect(sourceButtons(root)).toHaveLength(3);
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('a synchronous throw in the App call ends in FAILED', async () => {
        const app = makeApp({ throws: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();

        expect(gate.state).toBe('FAILED');
        // aria-busy is present only while an attempt is in flight.
        expect(root.hasAttribute('aria-busy')).toBe(false);
    });

    it('a failed alternative keeps the remembered primary and adds the retry marker', async () => {
        const app = makeApp({ outcome: false });
        const { gate, root, storage } = mountGate({ app, remembered: 3 });

        clickSource(root, 2);
        await tick();

        expect(gate.state).toBe('FAILED');
        expect(primaryButton(root).dataset.source).toBe('3');
        expect(primaryButton(root).dataset.retry).toBe('true');
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('the retry control is the primary button itself and the only retry marker', async () => {
        const app = makeApp({ outcome: false });
        const { gate, root } = mountGate({ app, remembered: 2 });

        expect(root.querySelectorAll('[data-retry="true"]')).toHaveLength(0);

        clickSource(root, 2);
        await tick();

        expect(gate.state).toBe('FAILED');
        expect(root.querySelectorAll('[data-retry="true"]')).toHaveLength(1);
        expect(primaryButton(root).dataset.source).toBe('2');
        expect(sourceButtons(root)).toHaveLength(3);
    });

    it('a failed attempt keeps every source available for an explicit retry', async () => {
        const app = makeApp({ manual: true });
        const { gate, root } = mountGate({ app, remembered: 2 });

        clickSource(root, 2);
        await tick();
        app.resolveAll(false);
        await tick();
        expect(gate.state).toBe('FAILED');

        clickSource(root, 2);
        await tick();
        app.resolveAll(true);
        await tick();

        expect(gate.state).toBe('STARTED');
        expect(app.beginCalls).toEqual([2, 2]);
    });

    it('success writes a short announcement into the existing polite status', async () => {
        const app = makeApp({ manual: true });
        const { gate, root } = mountGate({ app });
        const button = primaryButton(root);

        // A press that began on the gate keeps the subtree attached, which is
        // when the announcement is observable in the DOM.
        keydown(button, 'Enter');
        clickSource(root, 3);
        await tick();
        app.resolveAll(true);
        await tick();

        expect(gate.state).toBe('STARTED');
        const status = root.querySelector('[data-gate-status]');
        expect(status).not.toBeNull();
        expect(status.getAttribute('role')).toBe('status');
        expect(status.textContent.trim().length).toBeGreaterThan(0);
    });

    it('success with no key held retires the DOM immediately', async () => {
        const app = makeApp({ outcome: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();

        expect(gate.state).toBe('STARTED');
        expect(root.style.display).toBe('none');
        expect(root.innerHTML).toBe('');
    });

    it('a click that hits no source button is inert', async () => {
        const app = makeApp();
        const { root } = mountGate({ app });

        root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelector('[data-gate-status]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelector('.gate-sources').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await tick();

        expect(app.beginCalls).toEqual([]);
    });

    it('focus and the source nodes survive the attempt returning FAILED', async () => {
        const app = makeApp({ manual: true });
        const { root } = mountGate({ app, remembered: 2 });
        const button = primaryButton(root);
        button.focus();
        expect(document.activeElement).toBe(button);

        clickSource(root, 2);
        await tick();
        expect(document.activeElement).toBe(button);
        expect(primaryButton(root)).toBe(button);

        app.resolveAll(false);
        await tick();

        expect(document.activeElement).toBe(button);
        expect(primaryButton(root)).toBe(button);
    });

    it('aria-busy is true only while an attempt is in flight', async () => {
        const app = makeApp({ manual: true });
        const { root } = mountGate({ app });

        expect(root.hasAttribute('aria-busy')).toBe(false);
        clickSource(root, 3);
        expect(root.getAttribute('aria-busy')).toBe('true');
        app.resolveAll(false);
        await tick();
        expect(root.hasAttribute('aria-busy')).toBe(false);
    });

    it('a settle after dispose does nothing', async () => {
        const app = makeApp({ manual: true });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();
        gate.dispose();
        app.resolveAll(true);
        await tick();
        await macrotask();

        expect(gate.state).toBe('IDLE');
        expect(root.style.display).toBe('none');
        expect(root.innerHTML).toBe('');
    });
});

describe('StartGate - containment before success', () => {
    it('contained events are stopped at the root but never default-prevented', () => {
        const { root } = mountGate();
        const button = primaryButton(root);
        const bodyEvents = [];
        const listener = (event) => bodyEvents.push(event.type);
        for (const type of ISOLATED_EVENTS) document.body.addEventListener(type, listener);

        for (const type of ISOLATED_EVENTS) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            const notCancelled = button.dispatchEvent(event);
            expect(notCancelled, `${type} must not be default-prevented`).toBe(true);
        }

        for (const type of ISOLATED_EVENTS) document.body.removeEventListener(type, listener);
        expect(bodyEvents).toEqual([]);
    });

    it('a keyboard-synthesised click still produces exactly one attempt', async () => {
        const app = makeApp();
        const { root } = mountGate({ app });
        const button = primaryButton(root);

        keydown(button, 'Enter');
        keyup(button, 'Enter');
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
        await tick();

        expect(app.beginCalls).toEqual([3]);
    });
});

describe('StartGate - lifecycle', () => {
    it('dispose is terminal, idempotent and empties the gate', () => {
        const { gate, root } = mountGate();

        gate.dispose();
        expect(root.innerHTML).toBe('');
        expect(root.style.display).toBe('none');
        expect(gate.state).toBe('IDLE');

        gate.dispose();
        expect(gate.state).toBe('IDLE');
    });

    it('mount after dispose is a no-op', () => {
        const { gate, root } = mountGate();

        gate.dispose();
        gate.mount();

        expect(root.innerHTML).toBe('');
        expect(root.style.display).toBe('none');
        expect(gate.state).toBe('IDLE');
    });

    it('dispose removes the document lease and the root listeners', async () => {
        const { gate, root } = mountGate();
        const documentRemove = vi.spyOn(document, 'removeEventListener');
        const rootRemove = vi.spyOn(root, 'removeEventListener');

        keydown(primaryButton(root), 'Enter');
        gate.dispose();
        await macrotask();

        expect(documentRemove.mock.calls.some(([type, , capture]) => type === 'keydown' && capture === true)).toBe(true);
        expect(documentRemove.mock.calls.some(([type, , capture]) => type === 'keyup' && capture === true)).toBe(true);
        expect(rootRemove.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['click', ...ISOLATED_EVENTS]));
    });
});

describe('StartGate - keyboard lease lifetime', () => {
    it('no document listener exists at mount; one capture pair appears with the lease', () => {
        const root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        roots.push(root);
        const documentAdd = vi.spyOn(document, 'addEventListener');
        const windowAdd = vi.spyOn(window, 'addEventListener');
        const bodyAdd = vi.spyOn(document.body, 'addEventListener');

        const gate = new StartGate({ app: makeApp(), root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        expect(documentAdd).not.toHaveBeenCalled();

        keydown(primaryButton(root), 'Enter');

        const captured = documentAdd.mock.calls.filter(([, , capture]) => capture === true);
        expect(captured.map(([type]) => type).sort()).toEqual(['keydown', 'keyup']);
        expect(windowAdd).not.toHaveBeenCalled();
        expect(bodyAdd).not.toHaveBeenCalled();
    });

    it('a lost keyup in WAITING keeps the lease and the state; a fresh off-gate press drains it', async () => {
        vi.useFakeTimers();
        const app = makeApp();
        const { gate, root } = mountGate({ app });

        keydown(primaryButton(root), 'Enter');
        vi.advanceTimersByTime(0);
        await tick();
        expect(gate.state).toBe('WAITING');
        expect(app.beginCalls).toEqual([]);

        keydown(document.body, 'Enter');
        keyup(document.body, 'Enter');
        vi.advanceTimersByTime(0);
        await tick();

        expect(gate.state).toBe('WAITING');
        expect(root.style.display).toBe('block');
        expect(app.beginCalls).toEqual([]);
    });

    it('a lost keyup in FAILED keeps the state; a fresh on-gate press drains normally', async () => {
        vi.useFakeTimers();
        const app = makeApp({ outcome: false });
        const { gate, root } = mountGate({ app });

        clickSource(root, 3);
        await tick();
        expect(gate.state).toBe('FAILED');

        keydown(primaryButton(root), 'Space');
        vi.advanceTimersByTime(0);
        await tick();
        expect(gate.state).toBe('FAILED');

        keyup(primaryButton(root), 'Space');
        vi.advanceTimersByTime(0);
        await tick();

        expect(gate.state).toBe('FAILED');
        expect(root.style.display).toBe('block');
        expect(app.beginCalls).toEqual([3]);
    });

    it('no timer ever dispatches acquisition on its own', async () => {
        vi.useFakeTimers();
        const app = makeApp();
        const { root } = mountGate({ app });

        keydown(primaryButton(root), 'Enter');
        vi.advanceTimersByTime(0);
        vi.advanceTimersByTime(60_000);
        await tick();

        expect(app.beginCalls).toEqual([]);
        expect(app.setCalls).toEqual([]);
    });

    it('drains are coalesced and the lease is removed once, only after the later task', async () => {
        vi.useFakeTimers();
        const { gate, root } = mountGate();
        const button = primaryButton(root);
        const documentRemove = vi.spyOn(document, 'removeEventListener');

        keydown(button, 'Enter');
        keydown(button, 'Space');
        keyup(button, 'Enter');
        keyup(button, 'Space');

        expect(documentRemove).not.toHaveBeenCalled();

        vi.advanceTimersByTime(0);
        await tick();

        const keydownRemovals = documentRemove.mock.calls.filter(([type, , capture]) => type === 'keydown' && capture === true);
        const keyupRemovals = documentRemove.mock.calls.filter(([type, , capture]) => type === 'keyup' && capture === true);
        expect(keydownRemovals).toHaveLength(1);
        expect(keyupRemovals).toHaveLength(1);
        expect(gate.state).toBe('WAITING');
    });

    it('a drain pending at success is cancelled rather than run twice', async () => {
        vi.useFakeTimers();
        const app = makeApp({ outcome: true });
        const { gate, root } = mountGate({ app });
        const button = primaryButton(root);
        const documentRemove = vi.spyOn(document, 'removeEventListener');

        keydown(button, 'Enter');
        keyup(button, 'Enter');
        expect(documentRemove).not.toHaveBeenCalled();

        clickSource(root, 3);
        await tick();
        expect(gate.state).toBe('STARTED');
        expect(root.style.display).toBe('none');

        vi.runAllTimers();
        await tick();

        expect(root.style.display).toBe('none');
        const keydownRemovals = documentRemove.mock.calls.filter(([type, , capture]) => type === 'keydown' && capture === true);
        expect(keydownRemovals).toHaveLength(1);
    });

    it('a stale drain after dispose cannot change anything', async () => {
        vi.useFakeTimers();
        const { gate, root } = mountGate();

        keydown(primaryButton(root), 'Enter');
        gate.dispose();

        expect(() => vi.runAllTimers()).not.toThrow();
        await tick();

        expect(root.style.display).toBe('none');
        expect(root.innerHTML).toBe('');
        expect(gate.state).toBe('IDLE');
    });

    it('a keydown without a code installs no lease and is still contained', () => {
        const root = document.createElement('div');
        root.id = 'audio-hint';
        document.body.appendChild(root);
        roots.push(root);
        const documentAdd = vi.spyOn(document, 'addEventListener');
        const gate = new StartGate({ app: makeApp(), root, storage: makeStorage(3), canMic: true, canTab: true });
        gate.mount();

        keydown(primaryButton(root), '');

        expect(documentAdd).not.toHaveBeenCalled();
    });
});
