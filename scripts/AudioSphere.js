/*
    AudioSphere.js - application bootstrap.

    The visualizer itself lives in scripts/app/App.js; this module creates the
    app and decides how the user enters it. On a first visit (nothing
    remembered) it wires the start overlay; on later loads it skips the overlay,
    restores the remembered source, and waits for one user gesture - required
    before an AudioContext will run - behind a click/tap hint.

    Copyright © 2021 Anthony Stellato
*/

import { App } from './app/App.js';
import { AUDIOINPUTS } from './audio/AudioHandler.js';
import { resolveAudioSource } from './audio/audioSources.js';
import { loadAudioSource } from './app/Persistence.js';
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
    hint.textContent = remembered === AUDIOINPUTS.TAB
        ? 'Click or tap to share a tab'
        : 'Click or tap to start audio';
    hint.style.display = 'block';

    const start = async () => {
        // Enter the app on the first interaction; once it exists, a click retries
        // the remembered source instead of re-entering.
        const ok = app.initialized
            ? await app.setAudioSource(remembered)
            : await app.begin(remembered);
        if (ok) {
            hint.style.display = 'none';
            window.removeEventListener('pointerdown', start);
            window.removeEventListener('click', start);
            window.removeEventListener('keydown', start);
            window.removeEventListener('touchstart', start);
        }
        // On failure the hint and its listeners stay so the user can click again.
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('click', start);
    window.addEventListener('keydown', start);
    window.addEventListener('touchstart', start);
}

export { App };
