/*
    AudioSphere.js - An audio visualizer for WebGL written with three.js

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from '../vendor/three/build/three.module.js';
//import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import Stats from '../vendor/three/examples/jsm/libs/stats.module.js';

import { isMobile } from './Utils.js';
import { AudioHandler, AUDIOINPUTS } from './audio/AudioHandler.js';
import { PostProcessHandler } from './PostProcessHandler.js';
import { BlobShader } from './shaders/BlobShader.js';
import { StarFieldShader } from './shaders/StarFieldShader.js';
import {
    FFT_SIZE, AUDIO_LEVELS, SPHERE_RADIUS, SPHERE_RESOLUTION,
    DISPLACE_STRENGTH, MAX_DELTA_TIME,
    MAX_PIXEL_RATIO_DESKTOP, MAX_PIXEL_RATIO_MOBILE, NOISE_MAX,
    CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, CAMERA_Z,
    BRIGHTNESS_MIN, CONTRAST_MIN, OSCILATION_MIN, PHASE_MIN,
    BRIGHTNESS_MULT, CONTRAST_MULT, OSCILATION_MULT, PHASE_MULT,
} from './config.js';

const WORLD_AXIS_UP = new THREE.Vector3(0, 1, 0);

class AudioSphereApp {

    constructor(){
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.audioHandler = null;
        this.container = null;
        this.stats = null;
        this.blobUniforms = null;
        this.bgUniforms = null;
        this.postProcess = null;
        this.background = null;
        this.sphereMesh = null;
        this.audioType = null;
        this.showOverlay = false;
        this.debug = true;
        this.platformMobile = isMobile();
        // Starfield background is desktop-only: the 5-layer shader is too heavy for mobile GPUs
        this.showBackground = !this.platformMobile;
        this.maxPixelRatio = this.platformMobile ? MAX_PIXEL_RATIO_MOBILE : MAX_PIXEL_RATIO_DESKTOP;
        this.clock = new THREE.Clock(true);
        this.deltaTime = 0;
        this.elapsedTime = 0;
        this.initialized = false;

        // per-frame blob shader state, modulated from the audio analyzer
        this.uSpeed = 0.3;
        this.uNoiseStrength = 0.12;
        this.uNoiseDensity = 1.5;
        this.uFreq = 0;
        this.uAmp = 0;
        this.uOffset = 0.15;
        this.uHueIntensity = 0.75;
        this.uAlpha = 1.0;
        this.uBrightness = BRIGHTNESS_MIN.clone();
        this.uContrast = CONTRAST_MIN.clone();
        this.uOscilation = OSCILATION_MIN.clone();
        this.uPhase = PHASE_MIN.clone();

        // callbacks registered as event listeners / RAF need a stable `this`
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
    }

    startLive(){
        this.audioType = AUDIOINPUTS.MIC;
        this.init();
    }

    startDefault(){
        this.audioType = AUDIOINPUTS.DEFAULT;
        this.init();
    }

    init() {
        if(this.initialized)
            return;
        this.initialized = true;

        //

        const overlay = document.getElementById( 'overlay' );
        overlay.remove();

        //

        this.container = document.getElementById( 'container' );

        // MSAA doesn't apply to EffectComposer's render targets in r129, so antialiasing
        // is handled by an FXAA pass instead (added below with the post processing chain)
        this.renderer = new THREE.WebGLRenderer( { antialias: false } );
        this.renderer.setClearColor( 0x000000 );
        this.renderer.setPixelRatio( this.getPixelRatio() );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.container.appendChild( this.renderer.domElement );

        this.stats = new Stats();
        this.container.appendChild( this.stats.dom );
        this.hideStats();

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog( 0x000000, 1, 1000 );
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
        this.camera.position.z = CAMERA_Z;
        this.scene.add(this.camera);

        // const controls = new OrbitControls( camera, renderer.domElement );
        // controls.screenSpacePanning = true;

        this.audioHandler = new AudioHandler(this.audioType, this.debug, AUDIO_LEVELS, FFT_SIZE);
        // init() runs synchronously inside the button click, so this unlocks audio
        // under the browser autoplay policy
        this.audioHandler.resumeAudioContext();

        this.setupScene();

        this.postProcess = new PostProcessHandler(this.renderer, window.innerWidth, window.innerHeight, this.getPixelRatio());
        this.postProcess.addRenderPass(this.scene, this.camera);

        this.postProcess.addSobelPass();
        this.postProcess.addUnrealBloomPass(0, 0, 0.9);
        this.postProcess.addRGBShiftPass(0, 0);
        this.postProcess.addAfterImagePass();
        this.postProcess.addFXAAPass();     // smooths geometry edges now that MSAA is off
        this.postProcess.addFilmGrainPass(NOISE_MAX, 0., 512., false);

        document.addEventListener( 'dblclick', this.onDoubleClick );
        window.addEventListener( 'resize', this.onWindowResize );
        window.addEventListener( 'keyup', this.onKeyUp );

        this.animate();


    }

    setupScene(){
        this.setupSphere();
        //if(!isMobile())
        if(this.showBackground)
            this.setupBackground();
    }

    setupSphere(){
        const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_RESOLUTION, SPHERE_RESOLUTION);

        this.blobUniforms = THREE.UniformsUtils.clone( BlobShader.uniforms );

        const material = new THREE.ShaderMaterial({
            vertexShader: BlobShader.vertexShader,
            fragmentShader: BlobShader.fragmentShader,
            uniforms: this.blobUniforms,
            defines: {
              PI: Math.PI
            },
            // wireframe: true,
            side: THREE.DoubleSide,
            transparent: true,
          });
        this.sphereMesh = new THREE.Mesh(sphereGeometry, material);
        this.scene.add(this.sphereMesh);
    }

    setupBackground(){
        this.bgUniforms = THREE.UniformsUtils.clone( StarFieldShader.uniforms );
        this.bgUniforms[ 'resolution' ].value = new THREE.Vector2(window.innerWidth * this.getPixelRatio(), window.innerHeight * this.getPixelRatio());
        const material = new THREE.ShaderMaterial({
            vertexShader: StarFieldShader.vertexShader,
            fragmentShader: StarFieldShader.fragmentShader,
            uniforms: this.bgUniforms,
        });

        this.background = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
        this.background.position.z = -20;
        this.scene.add(this.background);
    }

    getPixelRatio(){
        return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    }

    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = this.getPixelRatio();

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio( pixelRatio );
        this.renderer.setSize( width, height );
        this.postProcess.setSize( width, height, pixelRatio );

        //if(!isMobile()){
        if(this.showBackground) {
            this.bgUniforms[ 'resolution' ].value.x = width * pixelRatio;
            this.bgUniforms[ 'resolution' ].value.y = height * pixelRatio;
        }
    }

    onDoubleClick( event ){
        // if(isMobile()){
        if(this.showBackground) {
            this.pauseResumeMusic();
        }

    }

    onKeyUp( event ) {
        switch(event.code){
            case 'ShiftLeft': // SHIFT
            case 'ShiftRight':
                if(this.debug){
                    (this.showOverlay) ? this.hideDebugDraw() : this.showDebugDraw();
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

        requestAnimationFrame( this.animate );

        if(this.isPlaying())
            this.render();

        this.stats.update();

    }

    render() {
        this.stats.begin();

        this.elapsedTime += this.deltaTime;

        this.audioHandler.update(this.deltaTime);

        if(this.isPlaying()){
            // displacement and rotation are cheap here: the actual vertex displacement
            // happens in the shader via uDisplace, only the mesh rotation touches the CPU
            const displace = DISPLACE_STRENGTH * this.audioHandler.analyzer.getAverage(5) * this.deltaTime;
            const rotate = this.audioHandler.analyzer.getRelativeTotal() * this.deltaTime * 2.0;
            this.sphereMesh.rotateOnWorldAxis(WORLD_AXIS_UP, rotate);
            this.updateShaders(displace);
        }

        //renderer.render( scene, camera );
        this.postProcess.render(this.deltaTime);

        this.stats.end();
    }

    updateShaders(displace){

        let avg0 = this.audioHandler.analyzer.getAverage(0);
        let avg1 = this.audioHandler.analyzer.getAverage(1);
        let avg2 = this.audioHandler.analyzer.getAverage(2);
        let avg3 = this.audioHandler.analyzer.getAverage(3);
        let avg4 = this.audioHandler.analyzer.getAverage(4);
        let avg5 = this.audioHandler.analyzer.getAverage(5);
        let s = this.audioHandler.analyzer.getRelativeTotal();

        this.uSpeed = avg3 * 0.25;
        this.uHueIntensity = 0.5 * avg4;
        //uAlpha = 1.0 - aaR0;
        this.uFreq = 1 + avg0 * 1.5;
        this.uAmp = 1 + avg1 * 1.5;
        this.uOffset = 1.0 - avg5;
        this.uNoiseStrength = 0.15 + 1.5 * avg2;
        this.uNoiseDensity = 2.0 * s;

        // COLOR

        this.uBrightness.x = BRIGHTNESS_MIN.x + BRIGHTNESS_MULT.x * avg3;
        this.uBrightness.y = BRIGHTNESS_MIN.y + BRIGHTNESS_MULT.y * avg1;
        this.uBrightness.z = BRIGHTNESS_MIN.z + BRIGHTNESS_MULT.z * avg0;

        this.uContrast.x = CONTRAST_MIN.x + CONTRAST_MULT.x * avg2;
        this.uContrast.y = CONTRAST_MIN.y + CONTRAST_MULT.y * avg5;
        this.uContrast.z = CONTRAST_MIN.z + CONTRAST_MULT.z * avg4;

        this.uOscilation.x = OSCILATION_MIN.x + OSCILATION_MULT.x * avg0;
        this.uOscilation.y = OSCILATION_MIN.y + OSCILATION_MULT.y * avg3;
        this.uOscilation.z = OSCILATION_MIN.z + OSCILATION_MULT.z * avg2;

        this.uPhase.x = PHASE_MIN.x + PHASE_MULT.x * avg1;
        this.uPhase.y = PHASE_MIN.y + PHASE_MULT.y * avg0;
        this.uPhase.z = PHASE_MIN.z + PHASE_MULT.z * avg2;

        // blob uniforms
        this.blobUniforms.uTime.value = this.elapsedTime;
        this.blobUniforms.uDisplace.value = displace;
        this.blobUniforms.uSpeed.value = this.uSpeed;
        this.blobUniforms.uNoiseStrength.value = this.uNoiseStrength;
        this.blobUniforms.uNoiseDensity.value = this.uNoiseDensity;
        this.blobUniforms.uFreq.value = this.uFreq;
        this.blobUniforms.uAmp.value = this.uAmp;
        this.blobUniforms.uOffset.value = this.uOffset;
        this.blobUniforms.uHue.value = this.uHueIntensity;
        this.blobUniforms.uAlpha.value = this.uAlpha;
        this.blobUniforms.uBrightness.value = this.uBrightness;
        this.blobUniforms.uContrast.value = this.uContrast;
        this.blobUniforms.uOscilation.value = this.uOscilation;
        this.blobUniforms.uPhase.value = this.uPhase;

        // post processing
        this.postProcess.enableSobelPass(s > 0.9 && s < 0.98);
        this.postProcess.afterImagePass.uniforms[ 'damp' ].value = .02 + avg0 * 0.97;
        const bloomStrength = avg4 * 0.25;
        this.postProcess.unrealBloomPass.strength = bloomStrength;
        // skip the whole bloom chain while its contribution would be invisible anyway
        this.postProcess.unrealBloomPass.enabled = bloomStrength > 0.01;
        this.postProcess.rgbShiftPass.uniforms[ 'amount' ].value = 0.006 * avg1;
        let rgbAngle = this.postProcess.rgbShiftPass.uniforms[ 'angle' ].value;

        rgbAngle += avg0 * 0.02;
        rgbAngle = rgbAngle % Math.PI;

        this.postProcess.rgbShiftPass.uniforms[ 'angle' ].value = rgbAngle;
        this.postProcess.filmPass.uniforms[ 'nIntensity' ].value = .1 + avg3*(NOISE_MAX - .1);

        // if(!isMobile()){
        if(this.showBackground) {
            this.bgUniforms[ 'time' ].value += s * 0.2;
            this.bgUniforms[ 'strength' ].value = 0.15 * avg2;
        }
    }

    isPlaying(){
        return this.audioHandler.audio.isPlaying || this.audioHandler.currentInput == AUDIOINPUTS.MIC;
    }

    pauseResumeMusic(){
        this.audioHandler.pauseResumeAudio();
    }

    restartMusic(){
        this.audioHandler.restartAudio();
    }

    hideStats(){
        this.stats.showPanel(5);
    }

    showStats(){
        this.stats.showPanel(0);
    }

    showDebugDraw(){
        document.getElementById( 'audio-debug-holder' ).style.display = 'block';
        this.audioHandler.analyzer.setDrawEnabled(true);
        this.showStats();
    }

    hideDebugDraw(){
        document.getElementById( 'audio-debug-holder' ).style.display = 'none';
        this.audioHandler.analyzer.setDrawEnabled(false);
        this.hideStats();
    }

}

const app = new AudioSphereApp();

const startButton = document.getElementById( 'startButton' );
startButton.addEventListener( 'click', () => app.startLive() );

const defaultButton = document.getElementById( 'defaultButton' );
defaultButton.addEventListener( 'click', () => app.startDefault() );

export { AudioSphereApp };
