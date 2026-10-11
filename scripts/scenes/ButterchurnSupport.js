/*
    ButterchurnSupport.js - WebGL2 + WebAudio capability probe.

    Butterchurn needs a WebGL2 context and an AudioContext. This mirrors its own
    isSupported check without importing butterchurn/lib/isSupported.min, which
    touches `window` at import time. Kept dependency-injectable so it is unit
    testable.

    Copyright © 2021 Anthony Stellato
*/

function isButterchurnSupported(
    createCanvas = () => document.createElement('canvas'),
    win = (typeof window !== 'undefined' ? window : {}),
) {
    try {
        const gl = createCanvas().getContext('webgl2');
        const hasAudio = !!(win.AudioContext || win.webkitAudioContext);
        return !!gl && hasAudio;
    } catch {
        return false;
    }
}

export { isButterchurnSupported };
