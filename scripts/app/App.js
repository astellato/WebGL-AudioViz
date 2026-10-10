/*
    App.js - the application: shared renderer, audio, loop and wiring.

    The scene lineup lives in the SceneManager; ControlState is the single
    source of truth for selection. This class owns the browser-facing pieces
    (renderer canvas, stats, audio handler, window events) and dispatches each
    frame to whichever scene is active.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';

import { isMobile } from '../Utils.js';
import { AudioHandler, AUDIOINPUTS } from '../audio/AudioHandler.js';
import { SCENE_DEFINITIONS } from '../scenes/index.js';
import { ControlState } from './ControlState.js';
import { SceneManager } from './SceneManager.js';
import { loadControlState, saveControlState } from './Persistence.js';
import {
    FFT_SIZE, AUDIO_LEVELS, MAX_DELTA_TIME,
    MAX_PIXEL_RATIO_DESKTOP, MAX_PIXEL_RATIO_MOBILE,
} from '../config.js';

class App {

    constructor() {
        this.renderer = null;
        this.container = null;
        this.stats = null;
        this.audioHandler = null;
        this.state = null;
        this.sceneManager = null;
        this.unsubscribe = null;

        this.audioType = null;
        this.showOverlay = false;
        this.debug = true;
        this.platformMobile = isMobile();
        this.maxPixelRatio = this.platformMobile ? MAX_PIXEL_RATIO_MOBILE : MAX_PIXEL_RATIO_DESKTOP;
        this.clock = new THREE.Clock(true);
        this.deltaTime = 0;
        this.initialized = false;

        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
    }

    startLive() {
        this.audioType = AUDIOINPUTS.MIC;
        this.init();
    }

    startDefault() {
        this.audioType = AUDIOINPUTS.DEFAULT;
        this.init();
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const overlay = document.getElementById('overlay');
        if (overlay) overlay.remove();

        this.container = document.getElementById('container');

        // MSAA doesn't apply to EffectComposer's render targets, so antialiasing
        // is handled by an FXAA pass inside each scene's post chain.
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setClearColor(0x000000);
        this.renderer.setPixelRatio(this.getPixelRatio());
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.stats = new Stats();
        this.container.appendChild(this.stats.dom);
        this.hideStats();

        this.audioHandler = new AudioHandler(this.audioType, this.debug, AUDIO_LEVELS, FFT_SIZE);
        // init() runs synchronously inside the button click, so this unlocks audio
        // under the browser autoplay policy
        this.audioHandler.resumeAudioContext();

        const sceneDefs = SCENE_DEFINITIONS.map((d) => ({ id: d.id, variantCount: d.variants.length }));
        this.state = new ControlState(sceneDefs, loadControlState(localStorage, sceneDefs));

        this.sceneManager = new SceneManager(SCENE_DEFINITIONS, {
            renderer: this.renderer,
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: this.getPixelRatio(),
            platformMobile: this.platformMobile,
            audioContext: this.audioHandler.listener.context,
            audioNode: this.audioHandler.getOutput(),
        });

        this.unsubscribe = this.state.subscribe((s) => this.applyState(s));
        this.applyState(this.state);

        document.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('keyup', this.onKeyUp);

        this.animate();
    }

    /** Keep the SceneManager and persistence in step with ControlState. */
    applyState(state) {
        const def = SCENE_DEFINITIONS[state.sceneIndex];
        if (!def) return;
        if (this.sceneManager.activeIndex !== state.sceneIndex) {
            this.sceneManager.activate(state.sceneIndex);
        }
        this.sceneManager.setActiveVariant(state.getVariantIndex(def.id));
        saveControlState(localStorage, state.toJSON());
    }

    getPixelRatio() {
        return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    }

    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = this.getPixelRatio();

        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height);
        this.sceneManager.resize(width, height, pixelRatio);
    }

    onDoubleClick() {
        // dblclick pause/resume is a desktop convenience; touch has swipe/buttons
        if (!this.platformMobile) {
            this.pauseResumeMusic();
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'ShiftLeft': // SHIFT
            case 'ShiftRight':
                if (this.debug) {
                    this.showOverlay ? this.hideDebugDraw() : this.showDebugDraw();
                    this.showOverlay = !this.showOverlay;
                }
                break;
            case 'Enter':
                this.restartMusic();
                break;
            case 'Space':
                this.pauseResumeMusic();
                break;
            case 'Digit1':
                this.stats.showPanel(0);
                break;
            case 'Digit2':
                this.stats.showPanel(1);
                break;
            case 'Digit3':
                this.stats.showPanel(2);
                break;
            case 'Digit4':
                this.stats.showPanel(5);
                break;
        }
    }

    animate() {
        this.deltaTime = Math.min(this.clock.getDelta(), MAX_DELTA_TIME);

        requestAnimationFrame(this.animate);

        if (this.isPlaying()) {
            this.render();
        }

        this.stats.update();
    }

    render() {
        this.stats.begin();

        this.audioHandler.update(this.deltaTime);

        this.sceneManager.update(
            this.audioHandler.analyzer,
            this.audioHandler.analyzer.getBeat(),
            this.deltaTime,
        );

        this.stats.end();
    }

    isPlaying() {
        return this.audioHandler.audio.isPlaying || this.audioHandler.currentInput === AUDIOINPUTS.MIC;
    }

    pauseResumeMusic() {
        this.audioHandler.pauseResumeAudio();
    }

    restartMusic() {
        this.audioHandler.restartAudio();
    }

    hideStats() {
        this.stats.showPanel(5);
    }

    showStats() {
        this.stats.showPanel(0);
    }

    showDebugDraw() {
        document.getElementById('audio-debug-holder').style.display = 'block';
        this.audioHandler.analyzer.setDrawEnabled(true);
        this.showStats();
    }

    hideDebugDraw() {
        document.getElementById('audio-debug-holder').style.display = 'none';
        this.audioHandler.analyzer.setDrawEnabled(false);
        this.hideStats();
    }
}

export { App };
