/*
    NameFlash.js - the brief bottom-right label.

    Shows whichever of scene/variant last changed (or Drift on/off) for a short
    time, then fades. The element itself lives in index.html.

    Copyright © 2021 Anthony Stellato
*/

class NameFlash {

    constructor(element, durationMs = 1600) {
        this.element = element;
        this.durationMs = durationMs;
        this.timer = null;
    }

    show(text) {
        if (!this.element) return;
        this.element.textContent = text;
        this.element.classList.add('visible');
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.element.classList.remove('visible');
            this.timer = null;
        }, this.durationMs);
    }
}

export { NameFlash };
