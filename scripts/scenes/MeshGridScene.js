/*
    MeshGridScene.js - a flat wireframe sheet that ripples from the spectrum.

    Column height follows the low spectrum, a travelling wave rolls across the
    sheet, and a beat kicks the peaks higher. Quality is a per-platform tier
    (resolution), never a hidden scene.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';

const QUALITY = {
    desktop: { cols: 96, rows: 56 },
    mobile: { cols: 48, rows: 28 },
};

const WIDTH = 4.2;
const HEIGHT = 2.4;

const VARIANTS = [
    { name: 'Default', params: { colorA: '#00e5ff', colorB: '#ff00d4', colorC: '#ffffff', lineOpacity: 0.9, waveSpeed: 1.6, amplitude: 0.9, beatKick: 0.7 } },
    { name: 'Neon Ridge', params: { colorA: '#39ff14', colorB: '#ff10f0', colorC: '#00fff7', lineOpacity: 1.0, waveSpeed: 2.2, amplitude: 1.2, beatKick: 1.0 } },
    { name: 'Deep Water', params: { colorA: '#05386b', colorB: '#5cdb95', colorC: '#8ee4af', lineOpacity: 0.8, waveSpeed: 0.9, amplitude: 0.6, beatKick: 0.5 } },
    { name: 'Heat Map', params: { colorA: '#ff4d00', colorB: '#ffd000', colorC: '#fff5cc', lineOpacity: 0.95, waveSpeed: 1.4, amplitude: 1.0, beatKick: 0.8 } },
    { name: 'Mono Wire', params: { colorA: '#bbbbbb', colorB: '#ffffff', colorC: '#888888', lineOpacity: 0.7, waveSpeed: 1.2, amplitude: 0.8, beatKick: 0.6 } },
];

const vertexShader = /* glsl */`
    varying float vHeight;
    void main() {
        vHeight = position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

const fragmentShader = /* glsl */`
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    uniform float uOpacity;
    varying float vHeight;
    void main() {
        float h = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uColorA, uColorB, h);
        col = mix(col, uColorC, smoothstep(0.7, 1.0, h));
        gl_FragColor = vec4(col, uOpacity);
    }`;

class MeshGridScene extends ThreeVisualizer {

    constructor(options) {
        super({ ...options, usePostProcess: false });
        this.elapsed = 0;
        this.p = VARIANTS[0].params;
        this.applyVariant(this.variants[0], 0);
    }

    build() {
        const quality = this.context.platformMobile ? QUALITY.mobile : QUALITY.desktop;
        const { cols, rows } = quality;
        const count = (cols + 1) * (rows + 1);

        const positions = new Float32Array(count * 3);
        this.uCoords = new Float32Array(count);
        this.yCoords = new Float32Array(count);

        for (let j = 0; j <= rows; j++) {
            for (let i = 0; i <= cols; i++) {
                const idx = j * (cols + 1) + i;
                const u = i / cols;
                const v = j / rows;
                positions[idx * 3] = (u - 0.5) * WIDTH;
                positions[idx * 3 + 1] = (v - 0.5) * HEIGHT;
                positions[idx * 3 + 2] = 0;
                this.uCoords[idx] = u;
                this.yCoords[idx] = v;
            }
        }

        const indices = [];
        for (let j = 0; j <= rows; j++) {
            for (let i = 0; i < cols; i++) {
                const a = j * (cols + 1) + i;
                indices.push(a, a + 1);
            }
        }
        for (let i = 0; i <= cols; i++) {
            for (let j = 0; j < rows; j++) {
                const a = j * (cols + 1) + i;
                indices.push(a, a + (cols + 1));
            }
        }

        this.geom = new THREE.BufferGeometry();
        this.geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geom.setIndex(indices);

        this.uniforms = {
            uColorA: { value: new THREE.Color(this.p.colorA) },
            uColorB: { value: new THREE.Color(this.p.colorB) },
            uColorC: { value: new THREE.Color(this.p.colorC) },
            uOpacity: { value: this.p.lineOpacity },
        };

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
        });

        this.mesh = new THREE.LineSegments(this.geom, material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.camera.position.set(0, 0, 2.6);
    }

    applyVariant(variant, index) {
        this.p = (variant && variant.params) || VARIANTS[0].params;
        if (this.uniforms) {
            this.uniforms.uColorA.value.set(this.p.colorA);
            this.uniforms.uColorB.value.set(this.p.colorB);
            this.uniforms.uColorC.value.set(this.p.colorC);
            this.uniforms.uOpacity.value = this.p.lineOpacity;
        }
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsed += deltaTime;
        const positions = this.geom.attributes.position;
        const arr = positions.array;
        const spectrum = audio.getSpectrum();
        const bins = spectrum.length;
        const relative = audio.getRelativeTotal();
        const amp = this.p.amplitude * (0.4 + relative);
        const kick = this.p.beatKick * beats.strength;
        const speed = this.p.waveSpeed;

        for (let i = 0; i < this.uCoords.length; i++) {
            const u = this.uCoords[i];
            const v = this.yCoords[i];
            const bin = Math.min(bins - 1, Math.floor(u * bins * 0.6));
            const band = spectrum[bin];
            const wave = Math.sin(u * 12 + this.elapsed * speed) * 0.12
                + Math.cos(v * 7 + this.elapsed * speed * 0.7) * 0.08;
            const center = Math.max(0, 1 - Math.abs(u - 0.5) * 2);
            arr[i * 3 + 2] = amp * band + wave + kick * center;
        }
        positions.needsUpdate = true;
    }
}

const meshGridSceneDefinition = {
    id: 'meshgrid',
    name: 'Mesh Grid',
    variants: VARIANTS,
    create: (ctx) => new MeshGridScene({
        id: 'meshgrid',
        name: 'Mesh Grid',
        variants: VARIANTS,
        renderer: ctx.renderer,
        context: ctx,
    }),
};

export { MeshGridScene, meshGridSceneDefinition };
