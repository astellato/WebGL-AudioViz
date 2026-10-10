/*
    ButterchurnScene.js - the Milkdrop presets, replayed via Butterchurn.

    Not a ThreeVisualizer: Butterchurn is its own WebGL2 engine on its own canvas
    (created once, hidden unless active) and its own context. The engine is
    imported lazily on first activation; the preset *data* is imported eagerly so
    the variant list (one variant per preset) is known before activation.

    If WebGL2 is unavailable, activation shows a quiet note instead of crashing.

    Copyright © 2021 Anthony Stellato
*/

import { isButterchurnSupported } from './ButterchurnSupport.js';
import butterchurnPresets from 'butterchurn-presets';

const BLEND_SECONDS = 2.0;

function presetMap() {
    const api = (butterchurnPresets && butterchurnPresets.getPresets)
        ? butterchurnPresets
        : (butterchurnPresets && butterchurnPresets.default) || {};
    try {
        return (api.getPresets ? api.getPresets() : {}) || {};
    } catch {
        return {};
    }
}

const PRESETS = presetMap();
const VARIANTS = Object.keys(PRESETS).map((name) => ({ name, params: { presetName: name } }));

// The butterchurn bundle is UMD: depending on how the bundler resolves it, the
// API can land on the namespace, its default, or a global it attached to.
function resolveButterchurn(mod) {
    const candidates = [mod, mod && mod.default, mod && mod.default && mod.default.default];
    if (typeof window !== 'undefined' && window.butterchurn) candidates.push(window.butterchurn);
    return candidates.find((c) => c && typeof c.createVisualizer === 'function') || mod;
}

class ButterchurnScene {

    constructor({ id, name, variants, context = {} }) {
        this.id = id;
        this.name = name;
        this.variants = variants;
        this.context = context;

        this.active = false;
        this.canvas = null;
        this.visualizer = null;
        this.unsupported = false;
        this.presetName = VARIANTS.length ? VARIANTS[0].name : null;
        this.pixelRatio = context.pixelRatio || 1;
        this._loading = null;
    }

    activate() {
        this.active = true;
        if (this.unsupported) {
            this._showNote();
            return;
        }
        if (!isButterchurnSupported()) {
            this.unsupported = true;
            this._showNote();
            return;
        }
        this._ensureCanvas();
        this._ensureVisualizer();
    }

    deactivate() {
        this.active = false;
        if (this.canvas) this.canvas.style.display = 'none';
    }

    setVariant(index) {
        const variant = this.variants[index];
        if (!variant) return;
        this.presetName = variant.name;
        this._loadPreset();
    }

    update() {
        if (this.active && this.visualizer) this.visualizer.render();
    }

    resize(width, height, pixelRatio) {
        this.pixelRatio = pixelRatio || this.pixelRatio;
        this._applySize();
    }

    dispose() {
        if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        this.canvas = null;
        this.visualizer = null;
    }

    // ---- internals ----

    _ensureCanvas() {
        if (this.canvas) {
            this.canvas.style.display = 'block';
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.id = 'butterchurn-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.display = 'block';
        canvas.style.zIndex = '1';
        const container = document.getElementById('container') || document.body;
        container.appendChild(canvas);
        this.canvas = canvas;
    }

    _size() {
        const width = Math.max(1, Math.floor(window.innerWidth * this.pixelRatio));
        const height = Math.max(1, Math.floor(window.innerHeight * this.pixelRatio));
        return { width, height };
    }

    _ensureVisualizer() {
        if (this.visualizer) {
            this._applySize();
            this._loadPreset();
            return;
        }
        if (this._loading) return;

        this._loading = import('butterchurn')
            .then((mod) => {
                const butterchurn = resolveButterchurn(mod);
                const { width, height } = this._size();
                this.visualizer = butterchurn.createVisualizer(this.context.audioContext, this.canvas, { width, height });
                if (this.context.audioNode) this.visualizer.connectAudio(this.context.audioNode);
                this._loadPreset();
            })
            .catch((error) => {
                console.error('Butterchurn failed to initialise', error);
                this.unsupported = true;
                this._showNote();
            })
            .finally(() => { this._loading = null; });
    }

    _applySize() {
        if (!this.visualizer) return;
        const { width, height } = this._size();
        this.visualizer.setRendererSize(width, height);
    }

    _loadPreset() {
        if (!this.visualizer || !this.presetName) return;
        const preset = PRESETS[this.presetName];
        if (preset) this.visualizer.loadPreset(preset, BLEND_SECONDS);
    }

    _showNote() {
        const note = document.getElementById('butterchurn-note');
        if (note) note.style.display = 'block';
    }
}

const butterchurnSceneDefinition = {
    id: 'butterchurn',
    name: 'Butterchurn',
    variants: VARIANTS,
    create: (ctx) => new ButterchurnScene({
        id: 'butterchurn',
        name: 'Butterchurn',
        variants: VARIANTS,
        context: ctx,
    }),
};

export { ButterchurnScene, butterchurnSceneDefinition };
