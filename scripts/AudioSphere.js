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

let scene, camera, renderer, audioHandler, container, stats;
let blobUniforms, bgUniforms;
let postProcess;
let background;
let showOverlay = false;
let debug = true;
let platformMobile = isMobile();
// Starfield background is desktop-only: the 5-layer shader is too heavy for mobile GPUs
let showBackground = !platformMobile;
let clock = new THREE.Clock(true);
let deltaTime;
let elapsedTime = 0;
let sphereMesh;
let audioType;

// tuning constants
const displaceStrength = 20; // sphere radial displacement, pushed to the GPU via uDisplace
const maxDeltaTime = 0.05;   // clamp frame gaps (tab refocus, GC stalls) to keep motion stable
const maxPixelRatio = platformMobile ? 1.5 : 2; // cap render resolution on high-DPI screens

let uSpeed = 0.3;
let uNoiseStrength = 0.12;
let uNoiseDensity = 1.5;
let uFreq = 0;
let uAmp = 0;
let uOffset = 0.15;
let uHueIntensity = 0.75;
let uAlpha = 1.0;
let uBrightness = new THREE.Vector3(0.5, 0.5, 0.4);
let uContrast = new THREE.Vector3(0.2, 0.4, 0.2);
let uOscilation = new THREE.Vector3(1.0, 0.7, 0);
let uPhase = new THREE.Vector3(0, 0.10, 0.20);

let uBrightnessMult = new THREE.Vector3(0.3, 0.1, 0.1);
let uContrastMult = new THREE.Vector3(0.3, 0.3, 0.3);
let uOscilationMult = new THREE.Vector3(1, 0.2, 1);
let uPhaseMult = new THREE.Vector3(0.4, 0.4, 0.4);

let uBrightnessMin = new THREE.Vector3(0.5, 0.5, 0.4);
let uContrastMin = new THREE.Vector3(0.2, 0.4, 0.2);
let uOscilationMin = new THREE.Vector3(1.0, 0.7, 0);
let uPhaseMin = new THREE.Vector3(0, 0.10, 0.20);

let noiseMax = 1.; //128

let worldAxisUp = new THREE.Vector3(0, 1, 0);

const startButton = document.getElementById( 'startButton' );
startButton.addEventListener( 'click', startLive );

const defaultButton = document.getElementById( 'defaultButton' );
defaultButton.addEventListener( 'click', startDefault );

function startLive(){
    audioType = AUDIOINPUTS.MIC;
    init();
}

function startDefault(){
    audioType = AUDIOINPUTS.DEFAULT;
    init();
}

function init() {

    const fftSize = 512;
    const audioLevels = 6;

    //

    const overlay = document.getElementById( 'overlay' );
    overlay.remove();

    //

    container = document.getElementById( 'container' );

    // MSAA doesn't apply to EffectComposer's render targets in r129, so antialiasing
    // is handled by an FXAA pass instead (added below with the post processing chain)
    renderer = new THREE.WebGLRenderer( { antialias: false } );
    renderer.setClearColor( 0x000000 );
    renderer.setPixelRatio( getPixelRatio() );
    renderer.setSize( window.innerWidth, window.innerHeight );
    container.appendChild( renderer.domElement );

    stats = new Stats();
	container.appendChild( stats.dom );
    hideStats();

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog( 0x000000, 1, 1000 );
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 3;
    scene.add(camera);

    // const controls = new OrbitControls( camera, renderer.domElement );
	// controls.screenSpacePanning = true;

    audioHandler = new AudioHandler(audioType, debug, audioLevels, fftSize);
    // init() runs synchronously inside the button click, so this unlocks audio
    // under the browser autoplay policy
    audioHandler.resumeAudioContext();

    setupScene();

    postProcess = new PostProcessHandler(renderer, window.innerWidth, window.innerHeight, getPixelRatio());
    postProcess.addRenderPass(scene, camera);

    postProcess.addSobelPass();
    postProcess.addUnrealBloomPass(0, 0, 0.9);
    postProcess.addRGBShiftPass(0, 0);
    //postProcess.addInvertPass();  // phew . . . too many effects for most comps :(
    postProcess.addAfterImagePass();
    postProcess.addFXAAPass();     // smooths geometry edges now that MSAA is off
    postProcess.addFilmGrainPass(noiseMax, 0., 512., false);

    document.addEventListener( 'dblclick', onDoubleClick );
    window.addEventListener( 'resize', onWindowResize );
    window.addEventListener( 'keyup', onKeyUp );

    animate();


}

function setupScene(){
    setupSphere();
    //if(!isMobile())
    if(showBackground)
        setupBackground();
}

function setupSphere(){
    const sphereRes = 128;
    const sphereGeometry = new THREE.SphereGeometry(0.25, sphereRes, sphereRes);

    blobUniforms = THREE.UniformsUtils.clone( BlobShader.uniforms );
    
    const material = new THREE.ShaderMaterial({
        vertexShader: BlobShader.vertexShader,
        fragmentShader: BlobShader.fragmentShader,
        uniforms: blobUniforms,
        defines: {
          PI: Math.PI
        },
        // wireframe: true,
        side: THREE.DoubleSide,
        transparent: true,
      });
    sphereMesh = new THREE.Mesh(sphereGeometry, material);
    scene.add(sphereMesh);
}

function setupBackground(){
    bgUniforms = THREE.UniformsUtils.clone( StarFieldShader.uniforms );
    bgUniforms[ 'resolution' ].value = new THREE.Vector2(window.innerWidth * getPixelRatio(), window.innerHeight * getPixelRatio());
    const material = new THREE.ShaderMaterial({
        vertexShader: StarFieldShader.vertexShader,
        fragmentShader: StarFieldShader.fragmentShader,
        uniforms: bgUniforms,
    });

    background = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
    background.position.z = -20;
    scene.add(background);
}

function getPixelRatio(){
    return Math.min(window.devicePixelRatio || 1, maxPixelRatio);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = getPixelRatio();

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio( pixelRatio );
    renderer.setSize( width, height );
    postProcess.setSize( width, height, pixelRatio );

    //if(!isMobile()){
    if(showBackground) {
        bgUniforms[ 'resolution' ].value.x = width * pixelRatio;
        bgUniforms[ 'resolution' ].value.y = height * pixelRatio;
    }
}

function onDoubleClick( event ){
    // if(isMobile()){
    if(showBackground) {
        pauseResumeMusic();
    }

}

function onKeyUp( event ) {
    switch(event.code){
        case 'ShiftLeft': // SHIFT
        case 'ShiftRight':
            if(debug){
                (showOverlay) ? hideDebugDraw() : showDebugDraw();
                showOverlay = !showOverlay;
            }
            break;
        case 'Enter':
            restartMusic();
            break;
        case 'Space':
            pauseResumeMusic();
            break;
        case 'Digit1':
            stats.showPanel(0);
            break;
        case 'Digit2':
            stats.showPanel(1);
            break;
        case 'Digit3':
            stats.showPanel(2);
            break;
        case 'Digit4':
            stats.showPanel(5);
            break;
    }
}

function animate() {
    deltaTime = Math.min(clock.getDelta(), maxDeltaTime);

    requestAnimationFrame( animate );

    if(isPlaying())
        render();

    stats.update();

}

function render() {
    stats.begin();

    elapsedTime += deltaTime;

    audioHandler.update(deltaTime);

    if(isPlaying()){
        // displacement and rotation are cheap here: the actual vertex displacement
        // happens in the shader via uDisplace, only the mesh rotation touches the CPU
        const displace = displaceStrength * audioHandler.analyzer.getAverage(5) * deltaTime;
        const rotate = audioHandler.analyzer.getRelativeTotal() * deltaTime * 2.0;
        sphereMesh.rotateOnWorldAxis(worldAxisUp, rotate);
        updateShaders(displace);
    }

    //renderer.render( scene, camera );
    postProcess.render(deltaTime);

    stats.end();
}

function updateShaders(displace){

    let avg0 = audioHandler.analyzer.getAverage(0);
    let avg1 = audioHandler.analyzer.getAverage(1);
    let avg2 = audioHandler.analyzer.getAverage(2);
    let avg3 = audioHandler.analyzer.getAverage(3);
    let avg4 = audioHandler.analyzer.getAverage(4);
    let avg5 = audioHandler.analyzer.getAverage(5);
    let s = audioHandler.analyzer.getRelativeTotal();

    uSpeed = avg3 * 0.25;
    uHueIntensity = 0.5 * avg4;
    //uAlpha = 1.0 - aaR0;
    uFreq = 1 + avg0 * 1.5;
    uAmp = 1 + avg1 * 1.5;
    uOffset = 1.0 - avg5;
    uNoiseStrength = 0.15 + 1.5 * avg2;
    uNoiseDensity = 2.0 * s;

    // COLOR

    uBrightness.x = uBrightnessMin.x + uBrightnessMult.x * avg3;
    uBrightness.y = uBrightnessMin.y + uBrightnessMult.y * avg1;
    uBrightness.z = uBrightnessMin.z + uBrightnessMult.z * avg0;

    uContrast.x = uContrastMin.x + uContrastMult.x + uContrastMult.x * avg2;
    uContrast.y = uContrastMin.y + uContrastMult.y + uContrastMult.y * avg5;
    uContrast.z = uContrastMin.z + uContrastMult.z + uContrastMult.z * avg4;

    uOscilation.x = uOscilationMin.x + uOscilationMult.x * avg0;
    uOscilation.y = uOscilationMin.y + uOscilationMult.y * avg3;
    uOscilation.z = uOscilationMin.z + uOscilationMult.z * avg2;

    uPhase.x = uPhaseMin.x + uPhaseMult.x * avg1;
    uPhase.y = uPhaseMin.y + uPhaseMult.y * avg0;
    uPhase.z = uPhaseMin.z + uPhaseMult.z * avg2;

    // blob uniforms
    blobUniforms.uTime.value = elapsedTime;
    blobUniforms.uDisplace.value = displace;
    blobUniforms.uSpeed.value = uSpeed;
    blobUniforms.uNoiseStrength.value = uNoiseStrength;
    blobUniforms.uNoiseDensity.value = uNoiseDensity;
    blobUniforms.uFreq.value = uFreq;
    blobUniforms.uAmp.value = uAmp;
    blobUniforms.uOffset.value = uOffset;
    blobUniforms.uHue.value = uHueIntensity;
    blobUniforms.uAlpha.value = uAlpha;
    blobUniforms.uBrightness.value = uBrightness;
    blobUniforms.uContrast.value = uContrast;
    blobUniforms.uOscilation.value = uOscilation;
    blobUniforms.uPhase.value = uPhase;

    // post processing
    if(postProcess.invertPass)
        postProcess.enableInvertPass(s > 0.98);
    postProcess.enableSobelPass(s > 0.9 && s < 0.98);
    postProcess.afterImagePass.uniforms[ 'damp' ].value = .02 + avg0 * 0.97;
    const bloomStrength = avg4 * 0.25;
    postProcess.unrealBloomPass.strength = bloomStrength;
    // skip the whole bloom chain while its contribution would be invisible anyway
    postProcess.unrealBloomPass.enabled = bloomStrength > 0.01;
    postProcess.rgbShiftPass.amount = 0.006 * avg1;
    let rgbAngle = postProcess.rgbShiftPass.angle;

    rgbAngle += avg0 * 0.02;
    rgbAngle = rgbAngle % Math.PI;
    
    postProcess.rgbShiftPass.angle = rgbAngle;
    postProcess.filmPass.uniforms[ 'nIntensity' ].value = .1 + avg3*(noiseMax - .1);
    
    // if(!isMobile()){
    if(showBackground) {
        bgUniforms[ 'time' ].value += s * 0.2;
        bgUniforms[ 'strength' ].value = 0.15 * avg2;
    }
}

function isPlaying(){
    return audioHandler.audio.isPlaying || audioHandler.currentInput == AUDIOINPUTS.MIC;
}

function pauseResumeMusic(){
    audioHandler.pauseResumeAudio();
}

function restartMusic(){
    audioHandler.restartAudio();
}

function hideStats(){
    stats.showPanel(5);
}

function showStats(){
    stats.showPanel(0);
}

function showDebugDraw(){
    document.getElementById( 'audio-debug-holder' ).style.display = 'block';
    audioHandler.analyzer.setDrawEnabled(true);
    showStats();
}

function hideDebugDraw(){
    document.getElementById( 'audio-debug-holder' ).style.display = 'none';
    audioHandler.analyzer.setDrawEnabled(false);
    hideStats();
}



