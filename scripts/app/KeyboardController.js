/*
    KeyboardController.js - global keydown for the new controls.

    The legacy keys (Shift, Enter, Space, 1-4) stay in App.onKeyUp; this handles
    the arrows and D/H. Shortcuts stay global except while a GUI control has
    focus.

    Copyright © 2021 Anthony Stellato
*/

import { resolveNewKey } from './InputResolvers.js';

class KeyboardController {

    constructor({ target = window, actions = {}, isGuiFocused = () => false } = {}) {
        this.target = target;
        this.actions = actions;
        this.isGuiFocused = isGuiFocused;
        this.onKeyDown = this.onKeyDown.bind(this);
        this.target.addEventListener('keydown', this.onKeyDown);
    }

    onKeyDown(event) {
        if (this.isGuiFocused(event)) return;
        const intent = resolveNewKey(event.code);
        if (intent && this.actions[intent]) this.actions[intent]();
    }

    dispose() {
        this.target.removeEventListener('keydown', this.onKeyDown);
    }
}

export { KeyboardController };
