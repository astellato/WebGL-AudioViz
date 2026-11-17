/*
    StartGate.js - the reload start gate: choose a source, then start audio.

    On a later load the app skips the start overlay, so this module offers the
    supported sources as real buttons inside the existing #audio-hint node (the
    remembered one primary) and runs one attempt at a time. It also keeps the
    app's global keyboard and gesture handlers from acting on presses aimed at
    the gate, and follows a gate-started key press to its release through a
    temporary document-level listener pair - never a window-level one.

    Copyright © 2021 Anthony Stellato
*/

import { AUDIOINPUTS, AUDIO_SOURCE_LABELS, resolveAudioSource } from '../audio/audioSources.js';
import { loadAudioSource } from './Persistence.js';

// The event types the app's global handlers consume: body GestureController
// (touch), window KeyboardController and App.onKeyUp (keys), document
// App.onDoubleClick. The gate contains exactly these and nothing else.
const ISOLATED_EVENTS = Object.freeze(['touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'dblclick']);

/**
 * The reload start gate. Activation is only reachable through a real click on
 * one of its buttons; there is deliberately no public activate().
 */
class StartGate {

    constructor({
        app, root, doc = document, storage, load = loadAudioSource,
        resolve = resolveAudioSource, canMic = true, canTab = false,
    }) {
        this.app = app;
        this.root = root;
        this.doc = doc;
        this.storage = storage;
        this.load = load;
        this.resolve = resolve;
        this.canMic = canMic;
        this.canTab = canTab;

        this.state = 'IDLE';

        this._mounted = false;
        this._disposed = false;
        this._attempt = 0;
        this._generation = 0;
        this._held = new Set();
        this._gateOwned = new WeakSet();
        this._drainHandle = null;
        this._docPair = null;
        this._rootHandlers = null;
        this._el = null;
    }

    mount() {
        if (this._disposed) return;
        if (this._mounted) {
            // A mounted gate only re-renders; an in-flight guard and a finished
            // gate are both left alone.
            if (this.state === 'STARTED') return;
            this._render();
            return;
        }
        this._build();
        this._attach();
        this._mounted = true;
        this.state = 'WAITING';
        this._render();
        this.root.style.display = 'block';
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._generation += 1;
        if (this._drainHandle !== null) {
            clearTimeout(this._drainHandle);
            this._drainHandle = null;
        }
        this._removeDocPair();
        this._removeRootListeners();
        this._held.clear();
        this._gateOwned = new WeakSet();
        this.state = 'IDLE';
        this.root.innerHTML = '';
        this.root.style.display = 'none';
        delete this.root.dataset.retiring;
        this.root.dataset.state = 'IDLE';
        this.root.removeAttribute('aria-busy');
    }

    _build() {
        const status = this.doc.createElement('div');
        status.className = 'gate-status';
        status.setAttribute('data-gate-status', '');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const sources = this.doc.createElement('div');
        sources.className = 'gate-sources';

        const buttons = new Map();
        const order = [AUDIOINPUTS.DEFAULT, AUDIOINPUTS.MIC];
        if (this.canTab) order.push(AUDIOINPUTS.TAB);
        for (const source of order) {
            const button = this.doc.createElement('button');
            button.type = 'button';
            button.setAttribute('data-source', String(source));
            button.textContent = AUDIO_SOURCE_LABELS[source];
            sources.appendChild(button);
            buttons.set(source, button);
        }

        this.root.appendChild(status);
        this.root.appendChild(sources);
        this._el = { status, sources, buttons };
    }

    _attach() {
        const handlers = {
            click: (event) => this._onClick(event),
            keydown: (event) => this._onRootKeyDown(event),
            keyup: (event) => this._onRootKeyUp(event),
        };
        for (const type of ISOLATED_EVENTS) {
            if (handlers[type]) continue;
            handlers[type] = (event) => this._onRootIsolated(event);
        }
        this._rootHandlers = handlers;
        for (const [type, handler] of Object.entries(handlers)) {
            this.root.addEventListener(type, handler);
        }
    }

    _removeRootListeners() {
        if (!this._rootHandlers) return;
        for (const [type, handler] of Object.entries(this._rootHandlers)) {
            this.root.removeEventListener(type, handler);
        }
        this._rootHandlers = null;
    }

    _render() {
        const el = this._el;
        if (!el) return;

        const remembered = this.resolve(this.load(this.storage), { canMic: this.canMic, canTab: this.canTab });
        const primary = remembered === null ? AUDIOINPUTS.DEFAULT : remembered;
        const retry = this.state === 'FAILED';

        for (const [source, button] of el.buttons) {
            if (source === primary) {
                button.setAttribute('data-primary', 'true');
                if (retry) button.setAttribute('data-retry', 'true');
                else button.removeAttribute('data-retry');
            } else {
                button.removeAttribute('data-primary');
                button.removeAttribute('data-retry');
            }
        }

        el.status.textContent = this._statusText(primary);
        this.root.dataset.state = this.state;
        if (this.state === 'ATTEMPTING') this.root.setAttribute('aria-busy', 'true');
        else this.root.removeAttribute('aria-busy');
    }

    _statusText(primary) {
        switch (this.state) {
            case 'ATTEMPTING': return 'Starting audio...';
            case 'FAILED': return 'Could not start that source. Choose one to try again.';
            case 'STARTED': return 'Audio started.';
            default:
                return primary === AUDIOINPUTS.TAB ? 'Click or tap to share a tab' : 'Click or tap to start audio';
        }
    }

    _onClick(event) {
        if (this._disposed) return;
        const target = event.target;
        const button = target && target.closest ? target.closest('button[data-source]') : null;
        if (!button || !this.root.contains(button)) return;
        if (this.state !== 'WAITING' && this.state !== 'FAILED') return;

        const source = Number(button.getAttribute('data-source'));
        this._attempt += 1;
        const attempt = this._attempt;
        this.state = 'ATTEMPTING';
        this._render();

        // Synchronous on purpose: the AudioContext unlock must still happen
        // inside this click, before any await.
        let pending;
        try {
            pending = this.app.initialized ? this.app.setAudioSource(source) : this.app.begin(source);
        } catch {
            pending = false;
        }
        Promise.resolve(pending).then(
            (ok) => this._settle(attempt, ok === true),
            () => this._settle(attempt, false),
        );
    }

    _settle(attempt, ok) {
        if (this._disposed || attempt !== this._attempt) return;
        if (!ok) {
            this.state = 'FAILED';
            this._render();
            return;
        }
        this.state = 'STARTED';
        this._render();
        this._retire();
    }

    /**
     * Success is terminal at once. Only a press that began on the gate is still
     * owed its release, so only then does the subtree stay attached.
     */
    _retire() {
        if (this._held.size === 0) {
            this._cleanup();
            return;
        }
        for (const button of this._el.buttons.values()) button.tabIndex = -1;
        this.root.dataset.retiring = 'true';
    }

    _cleanup() {
        this._generation += 1;
        if (this._drainHandle !== null) {
            clearTimeout(this._drainHandle);
            this._drainHandle = null;
        }
        this._removeDocPair();
        this._removeRootListeners();
        this._held.clear();
        this._gateOwned = new WeakSet();
        this.root.innerHTML = '';
        this.root.style.display = 'none';
        delete this.root.dataset.retiring;
    }

    _installDocPair() {
        if (this._docPair || this._disposed) return;
        this._docPair = {
            keydown: (event) => this._onDocKeyDown(event),
            keyup: (event) => this._onDocKeyUp(event),
        };
        this.doc.addEventListener('keydown', this._docPair.keydown, true);
        this.doc.addEventListener('keyup', this._docPair.keyup, true);
    }

    _removeDocPair() {
        if (!this._docPair) return;
        this.doc.removeEventListener('keydown', this._docPair.keydown, true);
        this.doc.removeEventListener('keyup', this._docPair.keyup, true);
        this._docPair = null;
    }

    /**
     * One owner for classification: a press that started on the gate belongs to
     * the gate until its release; a fresh press after success is ordinary
     * application input, even on the retained button.
     */
    _onDocKeyDown(event) {
        if (this._disposed) return;
        const code = event.code || '';
        if (!code) return;
        const inRoot = this.root.contains(event.target);

        if (this.state === 'STARTED') {
            if (!event.repeat) {
                // A fresh post-success press is ordinary application input: it
                // is no longer gate-owned, so it needs no containment.
                this._held.delete(code);
                this._scheduleDrain();
                return;
            }
            if (!inRoot && this._held.has(code)) event.stopPropagation();
            return;
        }

        if (!this._held.has(code)) return;
        if (event.repeat) {
            // A repeat of a still-held code stays gate-owned: inside the root
            // the root listener contains it, outside it is stopped here.
            if (!inRoot) event.stopPropagation();
            return;
        }
        if (inRoot) return;
        // A fresh press of the same code elsewhere releases stale ownership.
        this._held.delete(code);
        this._scheduleDrain();
    }

    _onDocKeyUp(event) {
        if (this._disposed) return;
        const code = event.code || '';
        if (!code) return;
        if (!this._held.has(code)) return;
        // The release stays gate-owned even if focus moved off the button.
        this._gateOwned.add(event);
        this._held.delete(code);
        this._scheduleDrain();
        if (!this.root.contains(event.target)) event.stopPropagation();
    }

    _onRootKeyDown(event) {
        if (this._disposed) return;
        const code = event.code || '';
        if (this.state !== 'STARTED') {
            if (code) {
                this._held.add(code);
                this._installDocPair();
            }
            event.stopPropagation();
            return;
        }
        // After success only a still-held repeat is gate-owned. A fresh press
        // was already classified at document capture and must pass through
        // untouched, so nothing is contained here for it.
        if (code && event.repeat && this._held.has(code)) event.stopPropagation();
    }

    _onRootKeyUp(event) {
        if (this._disposed) return;
        if (this.state !== 'STARTED') {
            event.stopPropagation();
            return;
        }
        if (this._gateOwned.has(event)) event.stopPropagation();
    }

    _onRootIsolated(event) {
        if (this._disposed) return;
        // Touch and double-click are contained only while the gate is live;
        // after success the retired subtree is not a new interaction surface.
        if (this.state !== 'STARTED') event.stopPropagation();
    }

    _scheduleDrain() {
        if (this._disposed || this._drainHandle !== null) return;
        const generation = this._generation;
        this._drainHandle = setTimeout(() => {
            this._drainHandle = null;
            if (this._disposed || generation !== this._generation) return;
            if (this._held.size !== 0) return;
            if (this.state === 'STARTED') {
                this._cleanup();
                return;
            }
            // Still waiting on a source: drop only the lease, never the state.
            this._removeDocPair();
        }, 0);
    }
}

export { StartGate, ISOLATED_EVENTS };
