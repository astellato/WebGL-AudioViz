/*
    LightFallScene.js - a front-facing canyon of dark trails with photons.

    You stand at the mouth of a canyon of curved light trails that fan wide
    around you and converge far away near the top centre. The trails are dim
    silhouettes; the light comes from photons that travel along the curves and
    flare with the music. The shape only ripples when the audio is intense.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { ThreeVisualizer } from './ThreeVisualizer.js';
import { clamp, checkIsNan } from '../Utils.js';
import {
    createTrailField, canyonPoint, canyonTangent, canyonLateral,
    rippleAmount, advancePhotons,
} from './LightFallField.js';

const QUALITY = {
    desktop: { trails: 84, photonsPerTrail: 6, segments: 48 },
    mobile: { trails: 44, photonsPerTrail: 4, segments: 32 },
};

// Curve tuning. Apex coordinates live on the field default; these ride on top.
const CURVE = {
    nearRadius: 4.2,
    nearZ: 1.4,
    apexY: 3.6,
    apexZ: -30,
    bendUp: 6.0,
    bendForward: 8.0,
    apexDrop: 10.0,
    apexBack: 10.0,
    rippleFreq: 6.0,
};

const TRAIL_WIDTH = 0.05;
const TRAIL_GAIN_BASE = 0.5;

const PHOTON_WIDTH = 0.07;
const PHOTON_LENGTH = 0.55;
const PHOTON_SPEED = 0.16;
const BEAT_SPREAD = 0.13;

// The trails only bend when level + beat strength gets past this — deliberately
// hard to reach so quiet music never ripples.
const RIPPLE_THRESHOLD = 1.15;
const RIPPLE_DECAY = 1.6;
const RIPPLE_SPEED = 3.0;

const VARIANTS = [
    {
        name: 'Default',
        params: {
            palette: ['#00e5ff', '#ff00d4', '#2a6bff', '#9b5cff', '#18e0ff', '#c04dff'],
            photon: '#eaffff', bloom: 0.9, speed: 1.0, trailGain: 0.34,
        },
    },
    {
        name: 'Ultraviolet',
        params: {
            palette: ['#7a00ff', '#c400ff', '#3a2bff', '#ff4fd8', '#5a2bff'],
            photon: '#f2e6ff', bloom: 1.0, speed: 0.9, trailGain: 0.3,
        },
    },
    {
        name: 'Ember',
        params: {
            palette: ['#ff3b00', '#ff8a00', '#ffd000', '#ff0060', '#ff6a00'],
            photon: '#fff2d6', bloom: 1.0, speed: 1.15, trailGain: 0.3,
        },
    },
    {
        name: 'Ice',
        params: {
            palette: ['#aef7ff', '#5cc8ff', '#7aa2ff', '#e8fbff', '#3fb6ff'],
            photon: '#ffffff', bloom: 0.85, speed: 0.85, trailGain: 0.4,
        },
    },
    {
        name: 'Acid',
        params: {
            palette: ['#9dff00', '#00ffa3', '#eaff00', '#00ff6a', '#b6ff2b'],
            photon: '#f4ffd6', bloom: 0.95, speed: 1.2, trailGain: 0.33,
        },
    },
];

const trailVertexShader = /* glsl */`
    attribute float aS;
    attribute float aPhase;
    attribute float aSide;
    attribute vec3 aLateral;
    attribute vec3 aColor;

    uniform float uRipple;
    uniform float uRippleFreq;
    uniform float uRippleTime;

    varying vec3 vColor;
    varying float vSide;

    void main() {
        vColor = aColor;
        vSide = aSide;
        float off = uRipple * sin(aS * uRippleFreq + aPhase + uRippleTime);
        vec3 p = position + aLateral * off;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;

const trailFragmentShader = /* glsl */`
    uniform float uTrailGain;

    varying vec3 vColor;
    varying float vSide;

    void main() {
        float e = 1.0 - abs(vSide);
        float edge = smoothstep(0.0, 0.7, e);
        float core = smoothstep(0.15, 1.0, e);
        vec3 col = vColor * (0.25 + 0.75 * core);
        gl_FragColor = vec4(col * uTrailGain, edge);
    }`;

const photonVertexShader = /* glsl */`
    attribute vec3 aColor;
    attribute float aIntensity;

    varying vec3 vColor;
    varying float vIntensity;
    varying vec2 vUv;

    void main() {
        vColor = aColor;
        vIntensity = aIntensity;
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }`;

const photonFragmentShader = /* glsl */`
    varying vec3 vColor;
    varying float vIntensity;
    varying vec2 vUv;

    void main() {
        vec2 d = vUv - vec2(0.5);
        float ax = abs(d.x) * 2.0;
        float ay = abs(d.y) * 2.0;
        float across = smoothstep(1.0, 0.0, ax);
        float along = smoothstep(1.0, 0.0, ay);
        float core = smoothstep(0.5, 0.0, length(vec2(d.x * 1.6, d.y * 0.9)));
        float a = clamp(across * along * 0.55 + core * 0.9, 0.0, 1.0);
        gl_FragColor = vec4(vColor * (0.55 + core), a * vIntensity);
    }`;

class LightFallScene extends ThreeVisualizer {

    constructor(options) {
        super(options);
        this.elapsed = 0;
        this.rippleTime = 0;
        this.ripple = 0;
        this.p = VARIANTS[0].params;
        this.applyVariant(this.variants[0], 0);
    }

    configurePostProcess(handler) {
        handler.addRenderPass(this.scene, this.camera);
        // runs inside super(), before this.p is assigned -> use the default variant
        handler.addUnrealBloomPass(VARIANTS[0].params.bloom, 0.7, 0.15);
        handler.addOutputPass();
        handler.setSize(this.context.width, this.context.height, this.context.pixelRatio || 1);
    }

    build() {
        const quality = this.context.platformMobile ? QUALITY.mobile : QUALITY.desktop;
        this.field = createTrailField({ ...CURVE, trailCount: quality.trails, segments: quality.segments });

        this._buildTrails(quality);
        this._buildPhotons(quality);

        // reusable scratch (plain objects feed the field, vectors feed three)
        this._p = { x: 0, y: 0, z: 0 };
        this._p2 = { x: 0, y: 0, z: 0 };
        this._lat = { x: 0, y: 0, z: 0 };
        this._tan = { x: 0, y: 0, z: 0 };
        this._pos = new THREE.Vector3();
        this._yAxis = new THREE.Vector3();
        this._zAxis = new THREE.Vector3();
        this._xAxis = new THREE.Vector3();
        this._view = new THREE.Vector3();
        this._basis = new THREE.Matrix4();
        this._quat = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._color = new THREE.Color();

        // camera sits at the mouth of the canyon, looking in and slightly up
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 1.0, -10);
    }

    _buildTrails(quality) {
        const field = this.field;
        const trails = field.trailCount;
        const segments = field.segments;
        const vertsPerTrail = (segments + 1) * 2;
        const vertexCount = trails * vertsPerTrail;

        const positions = new Float32Array(vertexCount * 3);
        const laterals = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);
        const sAttr = new Float32Array(vertexCount);
        const phaseAttr = new Float32Array(vertexCount);
        const sideAttr = new Float32Array(vertexCount);
        const indices = [];

        const point = { x: 0, y: 0, z: 0 };
        const lateral = { x: 0, y: 0, z: 0 };
        this.trailPalette = this.p.palette.map((hex) => new THREE.Color(hex));
        this._photonTint = new THREE.Color(this.p.photon);

        for (let i = 0; i < trails; i++) {
            const color = this.trailPalette[i % this.trailPalette.length];
            const phase = field.phase[i];
            const base = i * vertsPerTrail;

            for (let k = 0; k <= segments; k++) {
                const s = k / segments;
                canyonPoint(field, i, s, point);
                canyonLateral(field, i, s, lateral);

                for (let side = 0; side < 2; side++) {
                    const sign = side === 0 ? 1 : -1;
                    const vi = base + k * 2 + side;
                    positions[vi * 3] = point.x + lateral.x * TRAIL_WIDTH * sign;
                    positions[vi * 3 + 1] = point.y + lateral.y * TRAIL_WIDTH * sign;
                    positions[vi * 3 + 2] = point.z + lateral.z * TRAIL_WIDTH * sign;
                    laterals[vi * 3] = lateral.x;
                    laterals[vi * 3 + 1] = lateral.y;
                    laterals[vi * 3 + 2] = lateral.z;
                    colors[vi * 3] = color.r;
                    colors[vi * 3 + 1] = color.g;
                    colors[vi * 3 + 2] = color.b;
                    sAttr[vi] = s;
                    phaseAttr[vi] = phase;
                    sideAttr[vi] = sign;
                }
            }

            for (let k = 0; k < segments; k++) {
                const a = base + k * 2;
                const b = a + 1;
                const c = a + 2;
                const d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aLateral', new THREE.BufferAttribute(laterals, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aS', new THREE.BufferAttribute(sAttr, 1));
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phaseAttr, 1));
        geometry.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        this.uniforms = {
            uRipple: { value: 0 },
            uRippleFreq: { value: field.rippleFreq },
            uRippleTime: { value: 0 },
            uTrailGain: { value: TRAIL_GAIN_BASE * this.p.trailGain },
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: trailVertexShader,
            fragmentShader: trailFragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.trailMesh = new THREE.Mesh(geometry, material);
        this.trailMesh.frustumCulled = false;
        this.scene.add(this.trailMesh);
    }

    _buildPhotons(quality) {
        const field = this.field;
        const count = field.trailCount * quality.photonsPerTrail;

        const geometry = new THREE.PlaneGeometry(1, 1);
        const colors = new Float32Array(count * 3);
        const intensity = new Float32Array(count);

        this.geomColor = new THREE.InstancedBufferAttribute(colors, 3);
        this.geomIntensity = new THREE.InstancedBufferAttribute(intensity, 1);
        geometry.setAttribute('aColor', this.geomColor);
        geometry.setAttribute('aIntensity', this.geomIntensity);

        this.photonUniforms = {
            uRipple: { value: 0 },
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: photonVertexShader,
            fragmentShader: photonFragmentShader,
            uniforms: this.photonUniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.photonMesh = new THREE.InstancedMesh(geometry, material, count);
        this.photonMesh.frustumCulled = false;
        this.scene.add(this.photonMesh);

        this.photonState = {
            count,
            s: new Float32Array(count),
            speed: new Float32Array(count),
            track: new Float32Array(count),
        };

        for (let i = 0; i < count; i++) {
            const track = Math.floor(i / quality.photonsPerTrail);
            const withinTrail = (i % quality.photonsPerTrail) / quality.photonsPerTrail;
            this.photonState.track[i] = track;
            this.photonState.s[i] = (withinTrail + Math.random() * 0.1) % 1;
            this.photonState.speed[i] = 0.6 + Math.random() * 0.8;
        }

        this._obj = new THREE.Object3D();
    }

    applyVariant(variant, index) {
        this.p = (variant && variant.params) || VARIANTS[0].params;

        if (this.uniforms) {
            this.uniforms.uTrailGain.value = TRAIL_GAIN_BASE * this.p.trailGain;
        }
        if (this._photonTint) {
            this._photonTint.set(this.p.photon);
        }

        if (this.trailMesh) {
            this.trailPalette = this.p.palette.map((hex) => new THREE.Color(hex));
            const attr = this.trailMesh.geometry.getAttribute('aColor');
            const colors = attr.array;
            const vertsPerTrail = (this.field.segments + 1) * 2;
            for (let i = 0; i < this.field.trailCount; i++) {
                const color = this.trailPalette[i % this.trailPalette.length];
                const base = i * vertsPerTrail;
                for (let v = 0; v < vertsPerTrail; v++) {
                    colors[(base + v) * 3] = color.r;
                    colors[(base + v) * 3 + 1] = color.g;
                    colors[(base + v) * 3 + 2] = color.b;
                }
            }
            attr.needsUpdate = true;
        }
    }

    onUpdate(audio, beats, deltaTime) {
        this.elapsed += deltaTime;
        this.rippleTime += deltaTime * RIPPLE_SPEED;

        const relative = clamp(checkIsNan(audio.getRelativeTotal()), 0, 1);
        const spectrum = audio.getSpectrum();
        const flash = clamp(checkIsNan(beats.strength), 0, 1);
        const beatLocation = clamp(checkIsNan(beats.location), 0, 1);

        // ripple: only when level + beat gets past a high threshold
        const energy = relative + flash;
        if (energy > RIPPLE_THRESHOLD) {
            this.ripple = Math.min(1, Math.max(this.ripple, (energy - RIPPLE_THRESHOLD) / 0.6));
        }
        this.ripple = Math.max(0, this.ripple - deltaTime * RIPPLE_DECAY);

        this.uniforms.uRipple.value = this.ripple;
        this.uniforms.uRippleTime.value = this.rippleTime;
        this.uniforms.uTrailGain.value = TRAIL_GAIN_BASE * this.p.trailGain * (0.85 + relative * 0.3);

        this._updatePhotons(relative, flash, beatLocation, spectrum, deltaTime);

        if (this.postProcess && this.postProcess.unrealBloomPass) {
            this.postProcess.unrealBloomPass.strength = this.p.bloom * (1 + relative * 0.8 + flash * 1.2);
        }
    }

    _updatePhotons(relative, flash, beatLocation, spectrum, deltaTime) {
        const field = this.field;
        const state = this.photonState;
        const spectrumMax = spectrum.length - 1;

        advancePhotons(field, state, deltaTime, PHOTON_SPEED * this.p.speed * (0.6 + relative));

        const colors = this.geomColor.array;
        const intensity = this.geomIntensity.array;
        const p = this._p;
        const p2 = this._p2;
        const lat = this._lat;
        const tan = this._tan;
        const ripple = this.ripple;

        for (let i = 0; i < state.count; i++) {
            const track = state.track[i];
            const s = state.s[i];
            const q = field.spectral[track];

            canyonPoint(field, track, s, p);
            canyonLateral(field, track, s, lat);

            if (ripple > 0.001) {
                const off = rippleAmount(field, track, s, ripple, this.rippleTime);
                p.x += lat.x * off; p.y += lat.y * off; p.z += lat.z * off;

                // rippled tangent from a nearby sample
                const s0 = Math.max(0, s - 0.01);
                const s1 = Math.min(1, s + 0.01);
                canyonPoint(field, track, s0, p2);
                canyonLateral(field, track, s0, tan);
                const off0 = rippleAmount(field, track, s0, ripple, this.rippleTime);
                p2.x += tan.x * off0; p2.y += tan.y * off0; p2.z += tan.z * off0;

                const cx = p.x, cy = p.y, cz = p.z;
                canyonPoint(field, track, s1, p2);
                canyonLateral(field, track, s1, tan);
                const off1 = rippleAmount(field, track, s1, ripple, this.rippleTime);
                p2.x += tan.x * off1; p2.y += tan.y * off1; p2.z += tan.z * off1;

                tan.x = p2.x - cx; tan.y = p2.y - cy; tan.z = p2.z - cz;
                const len = Math.hypot(tan.x, tan.y, tan.z) || 1;
                tan.x /= len; tan.y /= len; tan.z /= len;
            } else {
                canyonTangent(field, track, s, tan);
            }

            // orient: local Y along the trail, local Z facing the camera at origin
            this._pos.set(p.x, p.y, p.z);
            this._yAxis.set(tan.x, tan.y, tan.z);
            this._view.set(-p.x, -p.y, -p.z);
            const align = this._view.dot(this._yAxis);
            this._zAxis.copy(this._view).addScaledVector(this._yAxis, -align);
            if (this._zAxis.lengthSq() < 1e-6) this._zAxis.set(0, 0, 1);
            this._zAxis.normalize();
            this._xAxis.crossVectors(this._yAxis, this._zAxis).normalize();
            this._basis.makeBasis(this._xAxis, this._yAxis, this._zAxis);
            this._quat.setFromRotationMatrix(this._basis);

            const band = spectrum[Math.min(spectrumMax, Math.max(0, Math.floor(q * spectrumMax)))];
            let brightness = 0.12 + band * 1.2 + relative * 0.5;
            if (flash > 0) {
                const d = (q - beatLocation) / BEAT_SPREAD;
                brightness += flash * 1.6 * Math.exp(-0.5 * d * d);
            }
            brightness = clamp(brightness, 0, 3);

            const stretch = 0.7 + relative * 0.8 + flash * 0.6 + brightness * 0.15;
            this._scale.set(PHOTON_WIDTH, PHOTON_LENGTH * stretch, 1);
            this._obj.position.copy(this._pos);
            this._obj.quaternion.copy(this._quat);
            this._obj.scale.copy(this._scale);
            this._obj.updateMatrix();
            this.photonMesh.setMatrixAt(i, this._obj.matrix);

            const baseColor = this.trailPalette[track % this.trailPalette.length];
            this._color.copy(baseColor).lerp(this._photonTint, 0.35 + Math.min(0.4, brightness * 0.3));
            colors[i * 3] = this._color.r * brightness;
            colors[i * 3 + 1] = this._color.g * brightness;
            colors[i * 3 + 2] = this._color.b * brightness;
            intensity[i] = clamp(brightness, 0, 1.4);
        }

        this.photonMesh.instanceMatrix.needsUpdate = true;
        this.geomColor.needsUpdate = true;
        this.geomIntensity.needsUpdate = true;
    }
}

const lightFallSceneDefinition = {
    id: 'lightfall',
    name: 'Light Fall',
    randomStartVariant: true,
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
