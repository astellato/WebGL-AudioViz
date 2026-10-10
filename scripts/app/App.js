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

import { isMobile, hasWebGL2 } from '../Utils.js';
import { AudioHandler, AUDIOINPUTS } from '../audio/AudioHandler.js';
import { SCENE_DEFINITIONS } from '../scenes/index.js';
import { ControlState } from './ControlState.js';
import { SceneManager } from './SceneManager.js';
import { loadControlState, saveControlState } from './Persistence.js';
import { NameFlash } from './NameFlash.js';
import { KeyboardController } from './KeyboardController.js';
import { GestureController } from './GestureController.js';
import { GUIController } from './GUIController.js';
import { DriftController } from './DriftController.js';
import {
    FFT_SIZE, AUDIO_LEVELS, MAX_DELTA_TIME,
    MAX_PIXEL_RATIO_DESKTOP, MAX_PIXEL_RATIO_MOBILE, NAME_FLASH_MS,
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
        this.nameFlash = null;
        this.keyboard = null;
        this.gestures = null;
        this.actions = null;
        this.gui = null;
        this.drift = null;

        this.audioType = null;
        this.showOverlay = false;
        this.statsVisible = false;
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

        // three r186's WebGLRenderer needs WebGL2; without it, constructing the
        // renderer throws and (overlay already gone) leaves a black screen.
        if (!hasWebGL2()) {
            this.showWebGL2Error();
            return;
        }

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

        this.nameFlash = new NameFlash(document.getElementById('name-flash'), NAME_FLASH_MS);
        this.actions = {
            'scene-next': () => this.changeScene(1),
            'scene-prev': () => this.changeScene(-1),
            'variant-next': () => this.changeVariant(1),
            'variant-prev': () => this.changeVariant(-1),
            'drift-toggle': () => this.toggleDrift(),
            'gui-toggle': () => this.toggleGui(),
            setScene: (i) => this.state.setScene(i),
            setVariant: (i) => { const id = this.activeSceneId(); if (id) this.state.setVariant(id, i); },
            setDriftEnabled: (b) => this.applyDriftEnabled(b),
            setDriftSpeed: (s) => { this.state.setDriftSpeed(Number(s)); if (this.drift) this.drift.setSpeed(Number(s)); },
            setDriftScope: (s) => this.state.setDriftScope(s),
            toggleStats: () => this.toggleStats(),
            toggleAudioDebug: () => this.toggleAudioDebug(),
            toggleGui: () => this.toggleGui(),
        };
        this.keyboard = new KeyboardController({
            actions: this.actions,
            isGuiFocused: (event) => this.isGuiFocused(event),
        });

        const guiToggle = document.getElementById('gui-toggle');
        if (guiToggle) {
            guiToggle.addEventListener('click', () => this.toggleGui());
        }
        this.gestures = new GestureController({
            element: document.body,
            actions: this.actions,
            isInteractive: (target) => !!(target && target.closest && (target.closest('#gui') || target.closest('#gui-toggle'))),
        });

        this.gui = new GUIController({
            root: document.getElementById('gui'),
            state: this.state,
            actions: this.actions,
            lineup: SCENE_DEFINITIONS,
            getDebugState: () => ({ stats: this.statsVisible, audioOverlay: this.showOverlay }),
        });

        this.drift = new DriftController(this.state.drift.speedSeconds);

        document.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('keyup', this.onKeyUp);

        this.animate();
    }

    activeSceneId() {
        const def = SCENE_DEFINITIONS[this.state.sceneIndex];
        return def ? def.id : null;
    }

    changeScene(dir) {
        const index = dir > 0 ? this.state.nextScene() : this.state.prevScene();
        const def = SCENE_DEFINITIONS[index];
        if (def) this.nameFlash.show(def.name);
    }

    changeVariant(dir) {
        const id = this.activeSceneId();
        if (!id) return;
        const index = dir > 0 ? this.state.nextVariant(id) : this.state.prevVariant(id);
        const def = SCENE_DEFINITIONS[this.state.sceneIndex];
        const variant = def ? def.variants[index] : null;
        if (variant) this.nameFlash.show(`${def.name} — ${variant.name}`);
    }

    toggleDrift() {
        const enabled = !this.state.drift.enabled;
        this.applyDriftEnabled(enabled);
        this.nameFlash.show(enabled ? 'Drift on' : 'Drift off');
    }

    /** Enabling drift starts a fresh interval; the timer lives in DriftController. */
    applyDriftEnabled(enabled) {
        this.state.setDriftEnabled(enabled);
        if (this.drift && enabled) {
            this.drift.setSpeed(this.state.drift.speedSeconds);
            this.drift.reset();
        }
    }

    flashCurrent() {
        const def = SCENE_DEFINITIONS[this.state.sceneIndex];
        if (!def) return;
        const variant = def.variants[this.state.getVariantIndex(def.id)];
        this.nameFlash.show(variant ? `${def.name} — ${variant.name}` : def.name);
    }

    isGuiFocused() {
        const el = document.activeElement;
        return !!(el && el.closest && el.closest('#gui'));
    }

    /** Keep the SceneManager and persistence in step with ControlState. */
    applyState(state) {
        const def = SCENE_DEFINITIONS[state.sceneIndex];
        if (!def) return;
        if (this.sceneManager.activeIndex !== state.sceneIndex) {
            this.sceneManager.activate(state.sceneIndex);
        }
        this.sceneManager.setActiveVariant(state.getVariantIndex(def.id));
        if (this.gui) this.gui.sync(state);
        saveControlState(localStorage, state.toJSON());
    }

    getPixelRatio() {
        return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    }

    showWebGL2Error() {
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.innerHTML = '<div class="overlayStartText">This visualizer needs WebGL2, which this browser or device does not support.</div>';
        }
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
        if (this.isGuiFocused(event)) return;
        switch (event.code) {
            case 'ShiftLeft': // SHIFT
            case 'ShiftRight':
                if (this.debug) {
                    if (this.showOverlay) {
                        this.hideDebugOverlay();
                        this.hideStats();
                    } else {
                        this.showDebugOverlay();
                        this.showStats();
                    }
                    if (this.gui) this.gui.sync(this.state);
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

        const driftDue = this.drift.tick(this.deltaTime, {
            enabled: this.state.drift.enabled,
            audioPaused: !this.isPlaying(),
            hidden: document.hidden,
        });
        if (driftDue) {
            this.state.driftStep();
            this.flashCurrent();
        }

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
        this.statsVisible = false;
    }

    showStats() {
        this.stats.showPanel(0);
        this.statsVisible = true;
    }

    showDebugOverlay() {
        document.getElementById('audio-debug-holder').style.display = 'block';
        this.audioHandler.analyzer.setDrawEnabled(true);
        this.showOverlay = true;
    }

    hideDebugOverlay() {
        document.getElementById('audio-debug-holder').style.display = 'none';
        this.audioHandler.analyzer.setDrawEnabled(false);
        this.showOverlay = false;
    }

    toggleStats() {
        if (this.statsVisible) this.hideStats();
        else this.showStats();
        if (this.gui) this.gui.sync(this.state);
    }

    toggleAudioDebug() {
        if (this.showOverlay) this.hideDebugOverlay();
        else this.showDebugOverlay();
        if (this.gui) this.gui.sync(this.state);
    }

    toggleGui() {
        if (this.gui) this.gui.toggle();
    }
}

export { App };
