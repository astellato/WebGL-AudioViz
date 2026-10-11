/*
    AudioSphere.js - application bootstrap.

    The visualizer itself now lives in scripts/app/App.js; this module only
    creates the app and wires the start overlay buttons.

    Copyright © 2021 Anthony Stellato
*/

import { App } from './app/App.js';

const app = new App();

const startButton = document.getElementById('startButton');
startButton.addEventListener('click', () => app.startLive());

const defaultButton = document.getElementById('defaultButton');
defaultButton.addEventListener('click', () => app.startDefault());

export { App };
