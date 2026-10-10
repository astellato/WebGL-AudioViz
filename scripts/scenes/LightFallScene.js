/*
    LightFallScene.js - vertical streaks of light raining and drifting.

    Each streak falls, recycles at the bottom, and sways sideways. A beat makes
    the streaks drop faster and flares the bloom. Quality is a per-platform
    streak-count tier.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';

const QUALITY = {
    desktop: { streaks: 400 },
    mobile: { streaks: 150 },
};

const VARIANTS = [
    { name: 'Default', params: { colorA: '#00b3ff', colorB: '#e0f7ff', fallSpeed: 0.9, streakLength: 1.0, bloom: 0.8, beatDrop: 1.4 } },
    { name: 'Acid Rain', params: { colorA: '#9dff00', colorB: '#f4ffb0', fallSpeed: 1.4, streakLength: 1.2, bloom: 0.9, beatDrop: 1.8 } },
    { name: 'Golden', params: { colorA: '#ffb300', colorB: '#fff3c4', fallSpeed: 0.7, streakLength: 1.0, bloom: 1.0, beatDrop: 1.2 } },
    { name: 'Aurora', params: { colorA: '#00ffa3', colorB: '#b06bff', fallSpeed: 0.8, streakLength: 1.3, bloom: 0.9, beatDrop: 1.3 } },
    { name: 'Mono', params: { colorA: '#999999', colorB: '#ffffff', fallSpeed: 1.0, streakLength: 1.0, bloom: 0.7, beatDrop: 1.1 } },
];

const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }`;

const fragmentShader = /* glsl */`
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
        float g = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        vec3 col = mix(uColorA, uColorB, vUv.y);
        gl_FragColor = vec4(col, g * uOpacity);
    }`;

class LightFallScene extends ThreeVisualizer {

    constructor(options) {
        super(options);
        this.elapsed = 0;
        this.p = VARIANTS[0].params;
        this.applyVariant(this.variants[0], 0);
    }

    configurePostProcess(handler) {
        handler.addRenderPass(this.scene, this.camera);
        // runs inside super(), before this.p is assigned -> use the default variant
        handler.addUnrealBloomPass(VARIANTS[0].params.bloom, 0.6, 0.2);
        handler.addOutputPass();
        handler.setSize(this.context.width, this.context.height, this.context.pixelRatio || 1);
    }

    build() {
        const quality = this.context.platformMobile ? QUALITY.mobile : QUALITY.desktop;
        this.count = quality.streaks;

        const geometry = new THREE.PlaneGeometry(0.03, 0.6);
        this.uniforms = {
            uColorA: { value: new THREE.Color(this.p.colorA) },
            uColorB: { value: new THREE.Color(this.p.colorB) },
            uOpacity: { value: 0.9 },
        };
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.x = new Float32Array(this.count);
        this.y = new Float32Array(this.count);
        this.z = new Float32Array(this.count);
        this.speed = new Float32Array(this.count);
        this.phase = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) {
            this._spawn(i, true);
        }

        this._obj = new THREE.Object3D();
        this.camera.position.set(0, 0, 3);
    }

    _spawn(i, initial) {
        this.x[i] = (Math.random() - 0.5) * 6;
        this.y[i] = initial ? (Math.random() - 0.5) * 4.5 : 2.6;
        this.z[i] = (Math.random() - 0.5) * 3;
        this.speed[i] = 0.6 + Math.random() * 0.8;
        this.phase[i] = Math.random() * Math.PI * 2;
    }

    applyVariant(variant, index) {
        this.p = (variant && variant.params) || VARIANTS[0].params;
        if (this.uniforms) {
            this.uniforms.uColorA.value.set(this.p.colorA);
            this.uniforms.uColorB.value.set(this.p.colorB);
        }
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsed += deltaTime;
        const relative = audio.getRelativeTotal();
        const flash = Math.min(1, beats.strength);
        const fall = this.p.fallSpeed * (0.7 + relative) + beats.strength * this.p.beatDrop;
        const lengthScale = this.p.streakLength * (1 + relative * 0.6 + flash * 0.4);

        for (let i = 0; i < this.count; i++) {
            this.y[i] -= fall * this.speed[i] * deltaTime;
            if (this.y[i] < -2.6) this._spawn(i, false);

            const sway = Math.sin(this.elapsed * 0.6 + this.phase[i]) * 0.15;
            this._obj.position.set(this.x[i] + sway, this.y[i], this.z[i]);
            this._obj.scale.set(1, lengthScale, 1);
            this._obj.updateMatrix();
            this.mesh.setMatrixAt(i, this._obj.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        this.uniforms.uOpacity.value = 0.75 + relative * 0.25 + flash * 0.25;
        this.postProcess.unrealBloomPass.strength = this.p.bloom * (1 + relative * 0.8 + flash * 1.2);
    }
}

const lightFallSceneDefinition = {
    id: 'lightfall',
    name: 'Light Fall',
    variants: VARIANTS,
    create: (ctx) => new LightFallScene({
        id: 'lightfall',
        name: 'Light Fall',
        variants: VARIANTS,
        renderer: ctx.renderer,
        context: ctx,
    }),
};

export { LightFallScene, lightFallSceneDefinition };
