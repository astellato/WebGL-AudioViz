/*
    GestureController.js - mobile swipes mapped to intents.

    Direction-thresholded: a mostly-vertical drag changes the variant, never the
    scene. A gesture that begins on an interactive element (the GUI panel or its
    toggle) is ignored, so tapping the button never switches anything.

    Copyright © 2021 Anthony Stellato
*/

import { resolveSwipe } from './InputResolvers.js';
import { SWIPE_THRESHOLD_PX } from '../config.js';

class GestureController {

    constructor({ element, actions = {}, threshold = SWIPE_THRESHOLD_PX, isInteractive = () => false } = {}) {
        this.element = element;
        this.actions = actions;
        this.threshold = threshold;
        this.isInteractive = isInteractive;
        this.start = null;

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);

        this.element.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.element.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.onTouchEnd, { passive: true });
    }

    onTouchStart(event) {
        if (event.touches.length !== 1 || this.isInteractive(event.target)) {
            this.start = null;
            return;
        }
        const touch = event.touches[0];
        this.start = { x: touch.clientX, y: touch.clientY };
    }

    onTouchMove(event) {
        // only suppress page scroll while tracking a swipe on the visuals
        if (!this.start) return;
        if (event.cancelable) event.preventDefault();
    }

    onTouchEnd(event) {
        if (!this.start) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - this.start.x;
        const dy = touch.clientY - this.start.y;
        this.start = null;

        const { axis, direction } = resolveSwipe(dx, dy, this.threshold);
        if (!axis || direction === 0) return;

        let intent;
        if (axis === 'scene') intent = direction > 0 ? 'scene-next' : 'scene-prev';
        else intent = direction > 0 ? 'variant-next' : 'variant-prev';

        if (this.actions[intent]) this.actions[intent]();
    }

    dispose() {
        this.element.removeEventListener('touchstart', this.onTouchStart);
        this.element.removeEventListener('touchmove', this.onTouchMove);
        this.element.removeEventListener('touchend', this.onTouchEnd);
    }
}

export { GestureController };
