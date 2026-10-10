/*
    GUIController.js - the small control panel.

    Closed by default; every control is a front end onto the shared actions map
    (the same map the keyboard and gestures use), so the panel never mutates
    state directly. sync() reflects ControlState back into the controls.

    Copyright © 2021 Anthony Stellato
*/

import { DRIFT_SPEED_OPTIONS, DRIFT_SCOPES } from '../config.js';

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'text') node.textContent = value;
        else if (key === 'onchange') node.addEventListener('change', value);
        else if (key === 'onclick') node.addEventListener('click', value);
        else node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(child);
    return node;
}

function option(value, label) {
    return el('option', { value, text: label });
}

class GUIController {

    constructor({ root, state, actions, lineup = [], getDebugState = () => ({}) }) {
        this.root = root;
        this.state = state;
        this.actions = actions;
        this.lineup = lineup;
        this.getDebugState = getDebugState;
        this.isOpen = false;
        this._build();
        this.sync(state);
    }

    _build() {
        this.root.innerHTML = '';
        this.root.classList.add('hidden');

        // Drift
        this.driftEnabled = el('input', { type: 'checkbox', id: 'gui-drift-enabled' });
        this.driftEnabled.addEventListener('change', () => this.actions.setDriftEnabled(this.driftEnabled.checked));

        this.driftSpeed = el('select', { id: 'gui-drift-speed' },
            DRIFT_SPEED_OPTIONS.map((s) => option(String(s), `${s}s`)));
        this.driftSpeed.addEventListener('change', () => this.actions.setDriftSpeed(Number(this.driftSpeed.value)));

        this.driftScope = el('select', { id: 'gui-drift-scope' },
            DRIFT_SCOPES.map((s) => option(s, s)));
        this.driftScope.addEventListener('change', () => this.actions.setDriftScope(this.driftScope.value));

        // Debug
        this.statsToggle = el('input', { type: 'checkbox', id: 'gui-stats' });
        this.statsToggle.addEventListener('change', () => this.actions.toggleStats());
        this.audioToggle = el('input', { type: 'checkbox', id: 'gui-audio' });
        this.audioToggle.addEventListener('change', () => this.actions.toggleAudioDebug());

        // Selection
        this.sceneSelect = el('select', { id: 'gui-scene' },
            this.lineup.map((def, index) => option(String(index), def.name)));
        this.sceneSelect.addEventListener('change', () => this.actions.setScene(Number(this.sceneSelect.value)));

        this.variantSelect = el('select', { id: 'gui-variant' });
        this.variantSelect.addEventListener('change', () => this.actions.setVariant(Number(this.variantSelect.value)));

        this.root.appendChild(el('div', { class: 'gui-header' }, [
            el('span', { text: 'Controls' }),
            el('button', { id: 'gui-close', text: '\u00d7', onclick: () => this.actions.toggleGui() }),
        ]));

        this.root.appendChild(el('div', { class: 'gui-section' }, [
            el('label', { class: 'gui-row' }, [el('span', { text: 'Drift' }), this.driftEnabled]),
            el('label', { class: 'gui-row' }, [el('span', { text: 'Speed' }), this.driftSpeed]),
            el('label', { class: 'gui-row' }, [el('span', { text: 'Scope' }), this.driftScope]),
        ]));

        this.root.appendChild(el('div', { class: 'gui-section' }, [
            el('label', { class: 'gui-row' }, [el('span', { text: 'Performance' }), this.statsToggle]),
            el('label', { class: 'gui-row' }, [el('span', { text: 'Audio overlay' }), this.audioToggle]),
        ]));

        this.root.appendChild(el('div', { class: 'gui-section' }, [
            el('label', { class: 'gui-row' }, [el('span', { text: 'Scene' }), this.sceneSelect]),
            el('label', { class: 'gui-row' }, [el('span', { text: 'Variant' }), this.variantSelect]),
        ]));
    }

    sync(state) {
        this.driftEnabled.checked = state.drift.enabled;
        this.driftSpeed.value = String(state.drift.speedSeconds);
        this.driftScope.value = state.drift.scope;
        this.sceneSelect.value = String(state.sceneIndex);

        const active = this.lineup[state.sceneIndex];
        if (active) {
            this.variantSelect.innerHTML = '';
            active.variants.forEach((variant, index) => {
                this.variantSelect.appendChild(option(String(index), variant.name));
            });
            this.variantSelect.value = String(state.getVariantIndex(active.id));
        }

        const debug = this.getDebugState();
        this.statsToggle.checked = !!debug.stats;
        this.audioToggle.checked = !!debug.audioOverlay;
    }

    open() {
        this.isOpen = true;
        this.root.classList.remove('hidden');
    }

    close() {
        this.isOpen = false;
        this.root.classList.add('hidden');
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }
}

export { GUIController };
