/*
    BlobScene.js - the original animated blob sphere over a starfield, migrated
    to ThreeVisualizer. It is the first scene in the lineup, so its Default
    variant must reproduce the pre-refactor look exactly.

    The starfield runs on mobile too now (the old `showBackground = !isMobile`
    gate is gone); the lower mobile pixel ratio is the quality tier.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';
import { BlobShader } from '../shaders/BlobShader.js';
import { StarFieldShader } from '../shaders/StarFieldShader.js';
import {
    SPHERE_RADIUS, SPHERE_RESOLUTION, DISPLACE_STRENGTH, NOISE_MAX,
    BRIGHTNESS_MIN, CONTRAST_MIN, OSCILATION_MIN, PHASE_MIN,
    BRIGHTNESS_MULT, CONTRAST_MULT, OSCILATION_MULT, PHASE_MULT, BEAT_PULSE,
} from '../config.js';

const WORLD_AXIS_UP = new THREE.Vector3(0, 1, 0);

function vec3(values, fallback) {
    return new THREE.Vector3(...(values || [fallback.x, fallback.y, fallback.z]));
}

// Hand-authored variants. `Default` deliberately overrides nothing, so the
// palette falls back to the config values that shipped before the refactor.
const VARIANTS = [
    { name: 'Default', params: {} },
    { name: 'Ember', params: { brightnessMin: [0.6, 0.28, 0.12], contrastMin: [0.35, 0.15, 0.08], oscilationMin: [1.0, 0.45, 0.1], phaseMin: [0.05, 0.0, 0.1], hueOffset: 0.05 } },
    { name: 'Lagoon', params: { brightnessMin: [0.18, 0.5, 0.55], contrastMin: [0.15, 0.35, 0.4], oscilationMin: [0.2, 0.8, 1.0], phaseMin: [0.1, 0.2, 0.35], hueOffset: 0.15 } },
    { name: 'Violet', params: { brightnessMin: [0.5, 0.32, 0.62], contrastMin: [0.3, 0.18, 0.36], oscilationMin: [0.9, 0.4, 1.0], phaseMin: [0.15, 0.1, 0.25], hueOffset: 0.25 } },
    { name: 'Monochrome', params: { brightnessMin: [0.5, 0.5, 0.5], contrastMin: [0.2, 0.2, 0.2], oscilationMin: [1.0, 1.0, 1.0], phaseMin: [0, 0.1, 0.2], hueOffset: 0.0 } },
];

class BlobScene extends ThreeVisualizer {

    constructor(options) {
        super(options);
        this.elapsedTime = 0;
        this.palette = {
            brightnessMin: BRIGHTNESS_MIN.clone(),
            contrastMin: CONTRAST_MIN.clone(),
            oscilationMin: OSCILATION_MIN.clone(),
            phaseMin: PHASE_MIN.clone(),
            hueOffset: 0,
        };
        // mutable per-frame state
        this.uSpeed = 0.3;
        this.uNoiseStrength = 0.12;
        this.uNoiseDensity = 1.5;
        this.uFreq = 0;
        this.uAmp = 0;
        this.uOffset = 0.15;
        this.uHueIntensity = 0.75;
        this.uAlpha = 1.0;
        this.uBrightness = new THREE.Vector3();
        this.uContrast = new THREE.Vector3();
        this.uOscilation = new THREE.Vector3();
        this.uPhase = new THREE.Vector3();

        this.applyVariant(this.variants[0], 0);
    }

    configurePostProcess(handler) {
        handler.addRenderPass(this.scene, this.camera);
        handler.addSobelPass();
        handler.addUnrealBloomPass(0, 0, 0.9);
        handler.addRGBShiftPass(0, 0);
        handler.addAfterImagePass();
        handler.addFXAAPass(); // smooths geometry edges now that MSAA is off
        handler.addFilmGrainPass(NOISE_MAX, false);
        handler.addOutputPass(); // sRGB conversion + tone mapping must come last
        // passes added after the handler's constructor never saw setSize:
        // push the physical size through every target once
        handler.setSize(this.context.width, this.context.height, this.context.pixelRatio || 1);
    }

    build() {
        this.setupSphere();
        // background is always built now (mobile included)
        this.setupBackground();
    }

    setupSphere() {
        const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_RESOLUTION, SPHERE_RESOLUTION);
        this.blobUniforms = THREE.UniformsUtils.clone(BlobShader.uniforms);
        const material = new THREE.ShaderMaterial({
            vertexShader: BlobShader.vertexShader,
            fragmentShader: BlobShader.fragmentShader,
            uniforms: this.blobUniforms,
            defines: { PI: Math.PI },
            side: THREE.DoubleSide,
            transparent: true,
        });
        this.sphereMesh = new THREE.Mesh(sphereGeometry, material);
        this.scene.add(this.sphereMesh);
    }

    setupBackground() {
        this.bgUniforms = THREE.UniformsUtils.clone(StarFieldShader.uniforms);
        const pixelRatio = this.context.pixelRatio || 1;
        this.bgUniforms['resolution'].value = new THREE.Vector2(this.context.width * pixelRatio, this.context.height * pixelRatio);
        const material = new THREE.ShaderMaterial({
            vertexShader: StarFieldShader.vertexShader,
            fragmentShader: StarFieldShader.fragmentShader,
            uniforms: this.bgUniforms,
        });
        this.background = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
        this.background.position.z = -20;
        this.scene.add(this.background);
    }

    applyVariant(variant, index) {
        const p = (variant && variant.params) || {};
        this.palette = {
            brightnessMin: vec3(p.brightnessMin, BRIGHTNESS_MIN),
            contrastMin: vec3(p.contrastMin, CONTRAST_MIN),
            oscilationMin: vec3(p.oscilationMin, OSCILATION_MIN),
            phaseMin: vec3(p.phaseMin, PHASE_MIN),
            hueOffset: p.hueOffset || 0,
        };
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsedTime += deltaTime;

        const displace = DISPLACE_STRENGTH * audio.getAverage(5) * deltaTime + BEAT_PULSE * beats.strength;
        const rotate = audio.getRelativeTotal() * deltaTime * 2.0;
        this.sphereMesh.rotateOnWorldAxis(WORLD_AXIS_UP, rotate);

        this.updateShaders(audio, displace);
    }

    updateShaders(audio, displace) {
        const avg0 = audio.getAverage(0);
        const avg1 = audio.getAverage(1);
        const avg2 = audio.getAverage(2);
        const avg3 = audio.getAverage(3);
        const avg4 = audio.getAverage(4);
        const avg5 = audio.getAverage(5);
        const s = audio.getRelativeTotal();

        const palette = this.palette;

        this.uSpeed = avg3 * 0.25;
        this.uHueIntensity = palette.hueOffset + 0.5 * avg4;
        this.uFreq = 1 + avg0 * 1.5;
        this.uAmp = 1 + avg1 * 1.5;
        this.uOffset = 1.0 - avg5;
        this.uNoiseStrength = 0.15 + 1.5 * avg2;
        this.uNoiseDensity = 2.0 * s;

        this.uBrightness.x = palette.brightnessMin.x + BRIGHTNESS_MULT.x * avg3;
        this.uBrightness.y = palette.brightnessMin.y + BRIGHTNESS_MULT.y * avg1;
        this.uBrightness.z = palette.brightnessMin.z + BRIGHTNESS_MULT.z * avg0;

        this.uContrast.x = palette.contrastMin.x + CONTRAST_MULT.x * avg2;
        this.uContrast.y = palette.contrastMin.y + CONTRAST_MULT.y * avg5;
        this.uContrast.z = palette.contrastMin.z + CONTRAST_MULT.z * avg4;

        this.uOscilation.x = palette.oscilationMin.x + OSCILATION_MULT.x * avg0;
        this.uOscilation.y = palette.oscilationMin.y + OSCILATION_MULT.y * avg3;
        this.uOscilation.z = palette.oscilationMin.z + OSCILATION_MULT.z * avg2;

        this.uPhase.x = palette.phaseMin.x + PHASE_MULT.x * avg1;
        this.uPhase.y = palette.phaseMin.y + PHASE_MULT.y * avg0;
        this.uPhase.z = palette.phaseMin.z + PHASE_MULT.z * avg2;

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
        this.postProcess.afterImagePass.uniforms['damp'].value = 0.02 + avg0 * 0.97;
        const bloomStrength = avg4 * 0.25;
        this.postProcess.unrealBloomPass.strength = bloomStrength;
        this.postProcess.unrealBloomPass.enabled = bloomStrength > 0.01;
        this.postProcess.rgbShiftPass.uniforms['amount'].value = 0.006 * avg1;
        let rgbAngle = this.postProcess.rgbShiftPass.uniforms['angle'].value;
        rgbAngle = (rgbAngle + avg0 * 0.02) % Math.PI;
        this.postProcess.rgbShiftPass.uniforms['angle'].value = rgbAngle;
        this.postProcess.filmPass.uniforms['intensity'].value = 0.1 + avg3 * (NOISE_MAX - 0.1);

        // background (always updated now)
        this.bgUniforms['time'].value += s * 0.2;
        this.bgUniforms['strength'].value = 0.15 * avg2;
    }

    onResize(width, height, pixelRatio) {
        if (this.bgUniforms) {
            this.bgUniforms['resolution'].value.x = width * pixelRatio;
            this.bgUniforms['resolution'].value.y = height * pixelRatio;
        }
    }
}

const variants = VARIANTS;

const blobSceneDefinition = {
    id: 'blob',
    name: 'Blob',
    variants,
    create: (ctx) => new BlobScene({
        id: 'blob',
        name: 'Blob',
        variants,
        renderer: ctx.renderer,
        context: ctx,
        usePostProcess: true,
    }),
};

export { BlobScene, blobSceneDefinition };
