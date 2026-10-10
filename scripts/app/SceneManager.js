/*
    SceneManager.js - lazy scene lifecycle and per-frame dispatch.

    Holds the ordered lineup from SceneDefinitions, creates each scene's heavy
    object only on first activation, deactivates the previous one, and keeps
    instances for reuse (except where a scene disposes itself). It knows nothing
    about ControlState; the App wires selection to it.

    Copyright © 2021 Anthony Stellato
*/

class SceneManager {

    /**
     * @param {Array<{id: string, name: string, variants: Array, create: Function}>} definitions
     * @param {object} context SceneContext handed to each scene factory
     */
    constructor(definitions = [], context = {}) {
        this.definitions = definitions;
        this.context = context;
        this.instances = new Map();
        this._activeIndex = -1;
    }

    get count() { return this.definitions.length; }
    get activeIndex() { return this._activeIndex; }

    get activeScene() {
        if (this._activeIndex < 0) return null;
        return this.instances.get(this.definitions[this._activeIndex].id) || null;
    }

    variantCount(index) {
        const def = this.definitions[index];
        return def ? def.variants.length : 0;
    }

    _getOrCreate(index) {
        const def = this.definitions[index];
        if (!def) return null;
        let scene = this.instances.get(def.id);
        if (!scene) {
            scene = def.create(this.context);
            this.instances.set(def.id, scene);
        }
        return scene;
    }

    /**
     * Deactivate the current scene and activate `index`, creating it lazily.
     * @returns {object|null} the active scene
     */
    activate(index) {
        if (index < 0 || index >= this.count) return this.activeScene;
        if (index === this._activeIndex) return this.activeScene;

        const current = this.activeScene;
        if (current && current.deactivate) current.deactivate();

        const scene = this._getOrCreate(index);
        this._activeIndex = index;
        if (scene && scene.activate) scene.activate();
        return scene;
    }

    setActiveVariant(variantIndex) {
        const scene = this.activeScene;
        if (!scene || !scene.setVariant) return;
        const count = scene.variants ? scene.variants.length : 0;
        const clamped = Math.min(Math.max(Math.trunc(Number(variantIndex)) || 0, 0), Math.max(0, count - 1));
        scene.setVariant(clamped);
    }

    update(audio, beats, deltaTime) {
        const scene = this.activeScene;
        if (scene && scene.update) scene.update(audio, beats, deltaTime);
    }

    resize(width, height, pixelRatio) {
        const scene = this.activeScene;
        if (scene && scene.resize) scene.resize(width, height, pixelRatio);
    }

    dispose() {
        for (const scene of this.instances.values()) {
            if (scene && scene.dispose) scene.dispose();
        }
        this.instances.clear();
        this._activeIndex = -1;
    }
}

export { SceneManager };
