/*
    TunnelScene.js - a rush down a tunnel of light rings.

    Rings recede toward the camera; forward speed follows the overall level and
    a beat surges it while flashing the rings white. Quality is a per-platform
    ring-count tier.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';

const QUALITY = {
    desktop: { rings: 48, segments: 64 },
    mobile: { rings: 28, segments: 40 },
};

const DEPTH = 60;

const VARIANTS = [
    { name: 'Default', params: { ringColor: '#00e5ff', speed: 1.0, pulse: 0.6, beatFlash: 1.2, opacity: 0.6 } },
    { name: 'Hyperdrive', params: { ringColor: '#ff00d4', speed: 1.8, pulse: 0.5, beatFlash: 2.0, opacity: 0.7 } },
    { name: 'Slow Pulse', params: { ringColor: '#7cff00', speed: 0.5, pulse: 1.2, beatFlash: 0.7, opacity: 0.55 } },
    { name: 'Emerald', params: { ringColor: '#00ff88', speed: 1.1, pulse: 0.8, beatFlash: 1.0, opacity: 0.6 } },
    { name: 'Crimson', params: { ringColor: '#ff2a2a', speed: 1.3, pulse: 0.7, beatFlash: 1.4, opacity: 0.65 } },
];

class TunnelScene extends ThreeVisualizer {

    constructor(options) {
        super({ ...options, usePostProcess: false });
        this.elapsed = 0;
        this.p = VARIANTS[0].params;
        this.color = new THREE.Color(this.p.ringColor);
        this.flashColor = new THREE.Color('#ffffff');
        this.applyVariant(this.variants[0], 0);
    }

    build() {
        const quality = this.context.platformMobile ? QUALITY.mobile : QUALITY.desktop;
        this.ringCount = quality.rings;

        const geometry = new THREE.RingGeometry(1.0, 1.25, quality.segments, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: this.p.opacity,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.ringCount);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.ringZ = new Float32Array(this.ringCount);
        for (let i = 0; i < this.ringCount; i++) {
            this.ringZ[i] = -(i / this.ringCount) * DEPTH;
        }

        this._obj = new THREE.Object3D();
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, -1);
    }

    applyVariant(variant, index) {
        this.p = (variant && variant.params) || VARIANTS[0].params;
        this.color.set(this.p.ringColor);
        if (this.mesh) this.mesh.material.opacity = this.p.opacity;
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsed += deltaTime;
        const relative = audio.getRelativeTotal();
        const spectrum = audio.getSpectrum();
        const flash = Math.min(1, beats.strength);
        const speed = (0.6 + relative * 1.5) * this.p.speed + beats.strength * this.p.beatFlash;

        for (let i = 0; i < this.ringCount; i++) {
            this.ringZ[i] += speed * deltaTime * 8;
            if (this.ringZ[i] > 2) this.ringZ[i] -= DEPTH;

            const depthT = 1 - Math.min(1, -this.ringZ[i] / DEPTH); // 0 far, 1 near
            const band = spectrum[Math.min(spectrum.length - 1, Math.floor(depthT * 48))];
            const scale = 1.2 + band * this.p.pulse + flash * 0.3;

            this._obj.position.set(0, 0, this.ringZ[i]);
            this._obj.rotation.z = this.elapsed * 0.3 + i * 0.1;
            this._obj.scale.setScalar(scale);
            this._obj.updateMatrix();
            this.mesh.setMatrixAt(i, this._obj.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        this.mesh.material.color.copy(this.color).lerp(this.flashColor, flash);
        this.mesh.material.opacity = this.p.opacity + relative * 0.25 + flash * 0.2;
    }
}

const tunnelSceneDefinition = {
    id: 'tunnel',
    name: 'Audio Tunnel',
    variants: VARIANTS,
    create: (ctx) => new TunnelScene({
        id: 'tunnel',
        name: 'Audio Tunnel',
        variants: VARIANTS,
        renderer: ctx.renderer,
        context: ctx,
    }),
};

export { TunnelScene, tunnelSceneDefinition };
