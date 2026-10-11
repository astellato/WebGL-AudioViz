/*
    Persistence.js - validate/load/save control state in localStorage.

    Everything read back is treated as untrusted: corrupt JSON, an unknown
    scene id, an out-of-range variant index or an invalid drift setting all
    fall back to sane defaults instead of breaking startup.

    Copyright © 2021 Anthony Stellato
*/

import {
    STORAGE_KEY, AUDIO_STORAGE_KEY, DRIFT_DEFAULT_SPEED_SECONDS, DRIFT_SPEED_OPTIONS, DRIFT_SCOPES,
} from '../config.js';
import { CHOOSABLE_SOURCES } from '../audio/audioSources.js';

function clampInt(value, min, max, fallback) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function defaults() {
    return {
        sceneIndex: 0,
        variantIndexByScene: {},
        drift: { enabled: false, speedSeconds: DRIFT_DEFAULT_SPEED_SECONDS, scope: 'visualizers' },
    };
}

function getStorage(storage) {
    if (storage) return storage;
    try {
        return (typeof localStorage !== 'undefined') ? localStorage : null;
    } catch {
        return null;
    }
}

/**
 * @param {{getItem: Function}} [storage]
 * @param {Array<{id: string, variantCount: number}>} [sceneDefs]
 */
function loadControlState(storage, sceneDefs = []) {
    const result = defaults();
    const store = getStorage(storage);
    if (!store) return result;

    let raw = null;
    try {
        raw = store.getItem(STORAGE_KEY);
    } catch {
        return result;
    }
    if (!raw) return result;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return result;
    }
    if (!parsed || typeof parsed !== 'object') return result;

    if (sceneDefs.length > 0) {
        result.sceneIndex = clampInt(parsed.sceneIndex, 0, sceneDefs.length - 1, 0);

        const byId = {};
        for (const def of sceneDefs) {
            const value = parsed.variantIndexByScene ? parsed.variantIndexByScene[def.id] : undefined;
            if (value !== undefined) {
                byId[def.id] = clampInt(value, 0, Math.max(0, def.variantCount - 1), 0);
            }
        }
        result.variantIndexByScene = byId;
    }

    if (parsed.drift && typeof parsed.drift === 'object') {
        result.drift.enabled = Boolean(parsed.drift.enabled);
        if (DRIFT_SPEED_OPTIONS.includes(parsed.drift.speedSeconds)) result.drift.speedSeconds = parsed.drift.speedSeconds;
        if (DRIFT_SCOPES.includes(parsed.drift.scope)) result.drift.scope = parsed.drift.scope;
    }

    return result;
}

function saveControlState(storage, state) {
    const store = getStorage(storage);
    if (!store) return;
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // private-browsing / quota: persistence is best-effort
    }
}

/**
 * The remembered audio source, or null when nothing valid is stored (so the
 * caller shows the start overlay, or falls back to Default music).
 * @param {{getItem: Function}} [storage]
 * @returns {number|null}
 */
function loadAudioSource(storage) {
    const store = getStorage(storage);
    if (!store) return null;

    let raw = null;
    try {
        raw = store.getItem(AUDIO_STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    const source = parsed && parsed.source;
    return CHOOSABLE_SOURCES.includes(source) ? source : null;
}

function saveAudioSource(storage, input) {
    const store = getStorage(storage);
    if (!store) return;
    try {
        store.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ source: input }));
    } catch {
        // private-browsing / quota: persistence is best-effort
    }
}

export { loadControlState, saveControlState, loadAudioSource, saveAudioSource };
