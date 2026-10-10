/*
    ParticleDanceScene.js - glowing particles swirling in clouds.

    A single Points cloud (never one object per particle). Swirl velocity follows
    the low bands, size/brightness/hue follow the highs, and a beat fires a
    radial burst that decays. Quality is a per-platform particle-count tier.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';

const QUALITY = {
    desktop: { count: 8000 },
    mobile: { count: 2500 },
};

const VARIANTS = [
    { name: 'Default', params: { colorA: '#00e5ff', colorB: '#ff00d4', particleSize: 1.4, swirlSpeed: 1.0, burstStrength: 0.5, drag: 1.6 } },
    { name: 'Nebula', params: { colorA: '#7a00ff', colorB: '#ff4fd8', particleSize: 1.8, swirlSpeed: 0.7, burstStrength: 0.6, drag: 1.2 } },
    { name: 'Fireflies', params: { colorA: '#ffee88', colorB: '#88ff44', particleSize: 1.2, swirlSpeed: 0.5, burstStrength: 0.35, drag: 2.0 } },
    { name: 'Ice', params: { colorA: '#bff4ff', colorB: '#3a7bff', particleSize: 1.6, swirlSpeed: 0.9, burstStrength: 0.45, drag: 1.8 } },
    { name: 'Confetti', params: { colorA: '#ff2a2a', colorB: '#ffd000', particleSize: 1.5, swirlSpeed: 1.6, burstStrength: 0.7, drag: 1.4 } },
];

const vertexShader = /* glsl */`
    attribute vec3 aColor;
    attribute float aSize;
    uniform float uSizeScale;
    varying vec3 vColor;
    void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (uSizeScale / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }`;

const fragmentShader = /* glsl */`
    varying vec3 vColor;
    void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vColor, a);
    }`;

class ParticleDanceScene extends ThreeVisualizer {

    constructor(options) {
        super({ ...options, usePostProcess: false });
        this.elapsed = 0;
        this.burst = 0;
        this.p = VARIANTS[0].params;
        this.applyVariant(this.variants[0], 0);
    }

    build() {
        const quality = this.context.platformMobile ? QUALITY.mobile : QUALITY.desktop;
        this.count = quality.count;

        const positions = new Float32Array(this.count * 3);
        const colors = new Float32Array(this.count * 3);
        const sizes = new Float32Array(this.count);

        this.radius = new Float32Array(this.count);
        this.angle = new Float32Array(this.count);
        this.y = new Float32Array(this.count);
        this.phase = new Float32Array(this.count);
        this.drift = new Float32Array(this.count);

        for (let i = 0; i < this.count; i++) {
            this.radius[i] = 0.3 + Math.random() * 1.5;
            this.angle[i] = Math.random() * Math.PI * 2;
            this.y[i] = (Math.random() - 0.5) * 2.4;
            this.phase[i] = Math.random() * Math.PI * 2;
            this.drift[i] = (Math.random() - 0.5) * 0.2;
            // aSize is a world-space radius; the vertex shader converts it to pixels
            sizes[i] = (0.015 + Math.random() * 0.03) * this.p.particleSize;
        }

        this.geom = new THREE.BufferGeometry();
        this.geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        this.geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        this.colorA = new THREE.Color(this.p.colorA);
        this.colorB = new THREE.Color(this.p.colorB);
        this.tmp = new THREE.Color();

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uSizeScale: { value: (this.context.height * (this.context.pixelRatio || 1)) * 0.5 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.points = new THREE.Points(this.geom, material);
        this.points.frustumCulled = false;
        this.scene.add(this.points);

        this.camera.position.set(0, 0, 3);
    }

    applyVariant(variant, index) {
        this.p = (variant && variant.params) || VARIANTS[0].params;
        if (this.colorA) {
            this.colorA.set(this.p.colorA);
            this.colorB.set(this.p.colorB);
        }
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsed += deltaTime;
        const relative = audio.getRelativeTotal();
        const spectrum = audio.getSpectrum();

        this.burst = Math.max(0, this.burst - deltaTime * this.p.drag) + beats.strength;
        this.burst = Math.min(1.2, this.burst);

        const swirl = this.p.swirlSpeed * (0.3 + relative * 1.2);
        const positions = this.geom.attributes.position.array;
        const colors = this.geom.attributes.aColor.array;

        for (let i = 0; i < this.count; i++) {
            this.angle[i] += swirl * deltaTime * (1 + (1.6 - this.radius[i]));
            this.y[i] += (Math.sin(this.elapsed * 0.5 + this.phase[i]) * 0.15 + this.drift[i]) * deltaTime;

            const r = this.radius[i] * (1 + this.burst * this.p.burstStrength);
            positions[i * 3] = Math.cos(this.angle[i]) * r;
            positions[i * 3 + 1] = this.y[i];
            positions[i * 3 + 2] = Math.sin(this.angle[i]) * r;

            const band = spectrum[Math.min(spectrum.length - 1, Math.floor((this.radius[i] / 1.8) * 64))];
            const mixT = 0.5 + 0.5 * Math.sin(this.angle[i] * 1.5 + this.elapsed);
            this.tmp.copy(this.colorA).lerp(this.colorB, mixT);
            const brightness = 0.4 + band * 0.6 + relative * 0.3;
            colors[i * 3] = this.tmp.r * brightness;
            colors[i * 3 + 1] = this.tmp.g * brightness;
            colors[i * 3 + 2] = this.tmp.b * brightness;
        }

        this.geom.attributes.position.needsUpdate = true;
        this.geom.attributes.aColor.needsUpdate = true;
    }

    onResize(width, height, pixelRatio) {
        if (this.points) {
            this.points.material.uniforms.uSizeScale.value = (height * pixelRatio) * 0.5;
        }
    }
}

const particleDanceSceneDefinition = {
    id: 'particles',
    name: 'Particle Dance',
    variants: VARIANTS,
    create: (ctx) => new ParticleDanceScene({
        id: 'particles',
        name: 'Particle Dance',
        variants: VARIANTS,
        renderer: ctx.renderer,
        context: ctx,
    }),
};

export { ParticleDanceScene, particleDanceSceneDefinition };
