/*
    audioSources.js - the audio input choices, as pure data and logic.

    Shared by the bootstrap (which decides between the start overlay and a
    straight-in reload), persistence (which validates the remembered value),
    and the GUI (which lists the choices). Kept free of DOM and Web Audio so it
    can be unit-tested and imported anywhere.

    Copyright © 2021 Anthony Stellato
*/

const AUDIOINPUTS = Object.freeze({ NONE: 0, DEFAULT: 1, MIC: 2, TAB: 3, DROPMP3: 4 });

// The sources a user can pick. DROPMP3 is a legacy stub and NONE is a state,
// not a choice, so neither is selectable.
const CHOOSABLE_SOURCES = Object.freeze([AUDIOINPUTS.DEFAULT, AUDIOINPUTS.MIC, AUDIOINPUTS.TAB]);

const AUDIO_SOURCE_LABELS = Object.freeze({
    [AUDIOINPUTS.DEFAULT]: 'Default music',
    [AUDIOINPUTS.MIC]: 'Microphone',
    [AUDIOINPUTS.TAB]: 'Tab audio',
});

/**
 * Decide which source to start with from the remembered value and what the
 * device can do. Returns null when nothing usable is remembered, which tells
 * the bootstrap to show the start overlay.
 *
 * @param {number|null} remembered
 * @param {{canMic?: boolean, canTab?: boolean}} [capability]
 * @returns {number|null}
 */
function resolveAudioSource(remembered, { canMic = true, canTab = false } = {}) {
    if (remembered === AUDIOINPUTS.TAB) return canTab ? AUDIOINPUTS.TAB : AUDIOINPUTS.DEFAULT;
    if (remembered === AUDIOINPUTS.MIC) return canMic ? AUDIOINPUTS.MIC : AUDIOINPUTS.DEFAULT;
    if (remembered === AUDIOINPUTS.DEFAULT) return AUDIOINPUTS.DEFAULT;
    return null;
}

export { AUDIOINPUTS, CHOOSABLE_SOURCES, AUDIO_SOURCE_LABELS, resolveAudioSource };
