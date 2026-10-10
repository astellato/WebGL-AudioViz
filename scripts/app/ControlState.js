/*
    ControlState.js - the single source of truth for selection and drift.

    Keyboard, gestures, GUI, persistence and the drift timer all read and write
    this object, so the three input front ends cannot drift out of sync. Any
    manual scene/variant change turns Drift off (a manual pick is never yanked
    away); the drift timer's own stepping does not.

    Copyright © 2021 Anthony Stellato
*/

import {
    DRIFT_DEFAULT_SPEED_SECONDS, DRIFT_SPEED_OPTIONS, DRIFT_SCOPES,
} from '../config.js';

function clampInt(value, min, max, fallback) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function defaultDrift() {
    return { enabled: false, speedSeconds: DRIFT_DEFAULT_SPEED_SECONDS, scope: 'visualizers' };
}

class ControlState {

    /**
     * @param {Array<{id: string, variantCount: number}>} sceneDefs lineup shape
     * @param {{sceneIndex?: number, variantIndexByScene?: object, drift?: object}} [persisted]
     */
    constructor(sceneDefs = [], persisted = null) {
        this.sceneDefs = sceneDefs.map((d) => ({ id: d.id, variantCount: Math.max(1, Math.trunc(d.variantCount) || 1) }));

        this._variantIndex = {};
        for (const d of this.sceneDefs) {
            this._variantIndex[d.id] = clampInt(persisted?.variantIndexByScene?.[d.id], 0, d.variantCount - 1, 0);
        }

        this._sceneIndex = clampInt(persisted?.sceneIndex, 0, Math.max(0, this.sceneDefs.length - 1), 0);

        this._drift = defaultDrift();
        if (persisted?.drift) {
            this._drift.enabled = Boolean(persisted.drift.enabled);
            if (DRIFT_SPEED_OPTIONS.includes(persisted.drift.speedSeconds)) this._drift.speedSeconds = persisted.drift.speedSeconds;
            if (DRIFT_SCOPES.includes(persisted.drift.scope)) this._drift.scope = persisted.drift.scope;
        }

        this._listeners = new Set();
    }

    get sceneIndex() { return this._sceneIndex; }
    get sceneCount() { return this.sceneDefs.length; }
    get drift() { return { ...this._drift }; }

    getVariantIndex(sceneId) { return this._variantIndex[sceneId] ?? 0; }

    variantCount(sceneId) {
        const d = this.sceneDefs.find((s) => s.id === sceneId);
        return d ? d.variantCount : 1;
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _activeId() {
        const d = this.sceneDefs[this._sceneIndex];
        return d ? d.id : null;
    }

    _notify() {
        for (const listener of this._listeners) listener(this);
    }

    _disableDrift() {
        this._drift.enabled = false;
    }

    // non-notifying, non-drift-disabling helpers used by driftStep()
    _advanceScene(dir) {
        if (this.sceneCount === 0) return this._sceneIndex;
        this._sceneIndex = (this._sceneIndex + dir + this.sceneCount) % this.sceneCount;
        return this._sceneIndex;
    }

    _advanceVariant(sceneId, dir) {
        const count = this.variantCount(sceneId);
        const next = (this.getVariantIndex(sceneId) + dir + count) % count;
        this._variantIndex[sceneId] = next;
        return next;
    }

    // manual scene selection
    setScene(index) {
        this._sceneIndex = clampInt(index, 0, Math.max(0, this.sceneCount - 1), 0);
        this._disableDrift();
        this._notify();
        return this._sceneIndex;
    }

    nextScene() { this._advanceScene(1); this._disableDrift(); this._notify(); return this._sceneIndex; }
    prevScene() { this._advanceScene(-1); this._disableDrift(); this._notify(); return this._sceneIndex; }

    // manual variant selection
    setVariant(sceneId, index) {
        this._variantIndex[sceneId] = clampInt(index, 0, this.variantCount(sceneId) - 1, 0);
        this._disableDrift();
        this._notify();
        return this._variantIndex[sceneId];
    }

    nextVariant(sceneId) { const v = this._advanceVariant(sceneId, 1); this._disableDrift(); this._notify(); return v; }
    prevVariant(sceneId) { const v = this._advanceVariant(sceneId, -1); this._disableDrift(); this._notify(); return v; }

    // drift settings
    setDriftEnabled(enabled) { this._drift.enabled = Boolean(enabled); this._notify(); }
    setDriftSpeed(seconds) {
        if (DRIFT_SPEED_OPTIONS.includes(seconds)) this._drift.speedSeconds = seconds;
        this._notify();
    }
    setDriftScope(scope) {
        if (DRIFT_SCOPES.includes(scope)) this._drift.scope = scope;
        this._notify();
    }

    /** Programmatic drift advance. Does not disable drift and notifies once. */
    driftStep() {
        const activeId = this._activeId();
        if (!activeId) return;
        if (this._drift.scope === 'variants') {
            this._advanceVariant(activeId, 1);
        } else if (this._drift.scope === 'both') {
            const next = this._advanceVariant(activeId, 1);
            if (next === 0) this._advanceScene(1);
        } else {
            this._advanceScene(1);
        }
        this._notify();
    }

    toJSON() {
        return {
            sceneIndex: this._sceneIndex,
            variantIndexByScene: { ...this._variantIndex },
            drift: { ...this._drift },
        };
    }
}

export { ControlState };
