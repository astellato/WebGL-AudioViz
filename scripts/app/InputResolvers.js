/*
    InputResolvers.js - pure mapping from raw input to intents.

    Kept DOM-free so keyboard and gesture controllers stay thin and the
    decision logic is unit-testable. Intent strings are shared with the
    App's action map.

    Copyright © 2021 Anthony Stellato
*/

import { SWIPE_THRESHOLD_PX } from '../config.js';

/**
 * @param {string} code KeyboardEvent.code
 * @returns {'scene-next'|'scene-prev'|'variant-next'|'variant-prev'|'drift-toggle'|'gui-toggle'|null}
 */
function resolveNewKey(code) {
    switch (code) {
        case 'ArrowRight': return 'scene-next';
        case 'ArrowLeft': return 'scene-prev';
        case 'ArrowDown': return 'variant-next';
        case 'ArrowUp': return 'variant-prev';
        case 'KeyD': return 'drift-toggle';
        case 'KeyH': return 'gui-toggle';
        default: return null;
    }
}

/**
 * Direction-thresholded swipe: a mostly-vertical drag never changes the scene.
 * @param {number} dx total horizontal movement (px, right positive)
 * @param {number} dy total vertical movement (px, down positive)
 * @param {number} [threshold]
 * @returns {{axis: 'scene'|'variant'|null, direction: 1|-1|0}}
 */
function resolveSwipe(dx, dy, threshold = SWIPE_THRESHOLD_PX) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= threshold) {
        return { axis: null, direction: 0 };
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
        // swipe left = next scene, swipe right = previous
        return { axis: 'scene', direction: dx < 0 ? 1 : -1 };
    }
    // swipe up = next variant, swipe down = previous
    return { axis: 'variant', direction: dy < 0 ? 1 : -1 };
}

export { resolveNewKey, resolveSwipe };
