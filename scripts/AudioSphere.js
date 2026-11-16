/*
    AudioSphere.js - application bootstrap.

    The visualizer itself lives in scripts/app/App.js; this module creates the
    app and decides how the user enters it. On a first visit (nothing
    remembered) it wires the start overlay. On later loads it skips the overlay
    and hands the reload start gate (scripts/app/StartGate.js) the remembered
    source, so the user can pick any supported source - one press, no window
    listeners.

    Copyright © 2021 Anthony Stellato
*/

import { App } from './app/App.js';
import { AUDIOINPUTS } from './audio/AudioHandler.js';
import { resolveAudioSource } from './audio/audioSources.js';
import { loadAudioSource } from './app/Persistence.js';
import { StartGate } from './app/StartGate.js';
import { hasMicrophone, hasTabAudioCapture, hasWebGL2 } from './Utils.js';

const app = new App();
const overlay = document.getElementById('overlay');
const hint = document.getElementById('audio-hint');

const canTab = hasTabAudioCapture();
const tabButton = document.getElementById('tabButton');
if (tabButton && !canTab) tabButton.style.display = 'none';

const wireStart = () => {
    document.getElementById('startButton').addEventListener('click', () => app.begin(AUDIOINPUTS.MIC));
    document.getElementById('defaultButton').addEventListener('click', () => app.begin(AUDIOINPUTS.DEFAULT));
    if (tabButton) tabButton.addEventListener('click', () => app.begin(AUDIOINPUTS.TAB));
};

const remembered = resolveAudioSource(loadAudioSource(localStorage), { canMic: hasMicrophone(), canTab });

// A device without WebGL2 keeps the overlay so App.begin can show the error in it.
if (remembered === null || !hasWebGL2()) {
    wireStart();
} else {
    overlay.remove();
    new StartGate({
        app,
        root: hint,
        storage: localStorage,
        canMic: hasMicrophone(),
        canTab,
    }).mount();
}

export { App };
