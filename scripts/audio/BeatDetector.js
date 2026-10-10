/*
    BeatDetector.js - spectral-flux onset detector with an adaptive threshold.

    Fed the normalized magnitude spectrum (0..1) each frame. It measures the
    positive bin-to-bin rise (spectral flux), compares it against a short
    rolling average of recent flux, and fires a packet on the frame a beat is
    detected. Robust across loud files, quiet files and noisy mics because the
    threshold adapts to the recent signal.

    No BPM or downbeat detection; that is out of scope.

    Copyright © 2021 Anthony Stellato
*/

import { clamp } from '../Utils.js';
import {
    BEAT_WINDOW_SECONDS, BEAT_MARGIN, BEAT_FLUX_FLOOR, BEAT_REFRACTORY_SECONDS,
} from '../config.js';

/**
 * @typedef {{ onBeat: boolean, strength: number, location: number, band: number }} BeatPacket
 */

function flatPacket() {
    return { onBeat: false, strength: 0, location: 0, band: 0 };
}

class BeatDetector {

    constructor({
        windowSeconds = BEAT_WINDOW_SECONDS,
        margin = BEAT_MARGIN,
        floor = BEAT_FLUX_FLOOR,
        refractorySeconds = BEAT_REFRACTORY_SECONDS,
        levelsCount = 6,
    } = {}) {
        this.windowSeconds = windowSeconds;
        this.margin = margin;
        this.floor = floor;
        this.refractorySeconds = refractorySeconds;
        this.levelsCount = levelsCount;

        this.prevSpectrum = null;
        this.history = [];   // { t, flux } samples within the rolling window
        this.clock = 0;
        this.timeSinceBeat = Infinity;
        this.packet = flatPacket();
    }

    reset() {
        this.prevSpectrum = null;
        this.history = [];
        this.clock = 0;
        this.timeSinceBeat = Infinity;
        this.packet = flatPacket();
    }

    /**
     * @param {Float32Array} spectrum normalized magnitude spectrum (0..1)
     * @param {number} deltaTime seconds since the previous frame
     * @returns {BeatPacket}
     */
    update(spectrum, deltaTime) {
        const n = spectrum.length;
        if (!this.prevSpectrum || this.prevSpectrum.length !== n) {
            this.prevSpectrum = new Float32Array(n);
        }

        // 1. spectral flux: sum of positive bin-to-bin rises, plus the weighted
        //    centroid of those rises for the spectral location.
        let riseSum = 0;
        let centroidNum = 0;
        let centroidDen = 0;
        for (let i = 0; i < n; i++) {
            const v = Number.isFinite(spectrum[i]) ? spectrum[i] : 0;
            const rise = v - this.prevSpectrum[i];
            if (rise > 0) {
                riseSum += rise;
                centroidNum += i * rise;
                centroidDen += rise;
            }
        }
        const flux = riseSum / n;

        // 2. adaptive threshold from the recent flux history
        let mean = 0;
        if (this.history.length > 0) {
            let sum = 0;
            for (let i = 0; i < this.history.length; i++) sum += this.history[i].flux;
            mean = sum / this.history.length;
        }
        const threshold = mean * this.margin + this.floor;

        // 3. fire, respecting the refractory window. A minimum amount of history
        //    avoids a spurious hit on the first frames before the average settles.
        let onBeat = false;
        if (flux > threshold && this.timeSinceBeat >= this.refractorySeconds && this.history.length >= 3) {
            onBeat = true;
            this.timeSinceBeat = 0;
        } else {
            this.timeSinceBeat += deltaTime;
        }

        let strength = 0;
        let location = 0;
        let band = 0;
        if (onBeat) {
            strength = clamp((flux - threshold) / Math.max(threshold, this.floor), 0, 1);
            location = centroidDen > 0
                ? clamp(centroidNum / centroidDen / (n > 1 ? n - 1 : 1), 0, 1 - 1e-6)
                : 0;
            band = Math.min(this.levelsCount - 1, Math.max(0, Math.floor(location * this.levelsCount)));
        }

        // advance the rolling history window
        this.clock += deltaTime;
        for (let i = 0; i < n; i++) {
            this.prevSpectrum[i] = Number.isFinite(spectrum[i]) ? spectrum[i] : 0;
        }
        this.history.push({ t: this.clock, flux });
        while (this.history.length > 0 && (this.clock - this.history[0].t) > this.windowSeconds) {
            this.history.shift();
        }

        this.packet = { onBeat, strength, location, band };
        return this.packet;
    }
}

export { BeatDetector };
