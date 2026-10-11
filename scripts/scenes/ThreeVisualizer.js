/*
    ThreeVisualizer.js - base class for the three.js scenes.

    Each scene owns its own THREE.Scene, camera and (optional) PostProcessHandler
    on the one shared WebGLRenderer, so its look is self-contained and cannot
    leak into another scene. Subclasses fill in the hooks; the base owns the
    lifecycle.

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';
import { PostProcessHandler } from '../PostProcessHandler.js';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, CAMERA_Z } from '../config.js';

class ThreeVisualizer {

    /**
     * @param {{
     *   id: string, name: string, variants?: Array,
     *   renderer: THREE.WebGLRenderer, context?: {width?: number, height?: number, pixelRatio?: number, platformMobile?: boolean},
     *   usePostProcess?: boolean
     * }} options
     */
    constructor({ id, name, variants = [], renderer, context = {}, usePostProcess = true }) {
        this.id = id;
        this.name = name;
        this.variants = variants;
        this.renderer = renderer;
        this.context = context;
        this.usePostProcess = usePostProcess;

        this.active = false;
        this._built = false;
        this._variantIndex = 0;

        const width = context.width || 1;
        const height = context.height || 1;
        const pixelRatio = context.pixelRatio || 1;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x000000, 1, 1000);

        this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
        this.camera.position.z = CAMERA_Z;
        this.scene.add(this.camera);

        if (this.usePostProcess) {
            this.postProcess = new PostProcessHandler(renderer, width, height, pixelRatio);
            this.configurePostProcess(this.postProcess);
        } else {
            this.postProcess = null;
        }
    }

    // ---- subclass hooks (override as needed) ----
    build() {}
    configurePostProcess(handler) { handler.addRenderPass(this.scene, this.camera); }
    onActivate() {}
    onDeactivate() {}
    onUpdate(audio, beats, deltaTime) {}
    applyVariant(variant, index) {}
    onResize(width, height, pixelRatio) {}
    onDispose() {}

    // ---- lifecycle ----
    activate() {
        if (!this._built) {
            this.build();
            this._built = true;
        }
        this.active = true;
        this.onActivate();
    }

    deactivate() {
        this.active = false;
        this.onDeactivate();
    }

    setVariant(index) {
        if (!this.variants.length) return;
        this._variantIndex = Math.min(Math.max(Math.trunc(Number(index)) || 0, 0), this.variants.length - 1);
        this.applyVariant(this.variants[this._variantIndex], this._variantIndex);
    }

    update(audio, beats, deltaTime) {
        if (!this.active) return;
        this.onUpdate(audio, beats, deltaTime);
        this.render();
    }

    render() {
        if (this.postProcess) this.postProcess.render(0);
        else this.renderer.render(this.scene, this.camera);
    }

    resize(width, height, pixelRatio) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        if (this.postProcess) this.postProcess.setSize(width, height, pixelRatio);
        this.onResize(width, height, pixelRatio);
    }

    dispose() {
        this.onDispose();
        this.scene.traverse((object) => {
            if (object.geometry && object.geometry.dispose) object.geometry.dispose();
            if (object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (material.dispose) material.dispose();
                }
            }
        });
        if (this.postProcess && this.postProcess.composer && this.postProcess.composer.dispose) {
            this.postProcess.composer.dispose();
        }
        this.active = false;
    }
}

export { ThreeVisualizer };
