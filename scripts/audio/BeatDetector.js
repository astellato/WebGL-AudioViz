/*
    BeatDetector.js - onset based beat detection with a tempo estimate

    Method (spectral flux):
      1. the power spectrum is grouped into narrow log spaced sub bands, in dB
      2. flux = how far each sub band rose compared to a fixed time ago, summed
         (rises only: a beat is energy arriving, not leaving), low end weighted up
      3. a beat fires when the flux clears an adaptive threshold (built from its running
         mean and deviation) and a short refractory time has passed
      4. the flux history is autocorrelated to estimate the tempo in BPM; each candidate
         period is scored together with its multiples, which rejects the 2/3 and 3/2
         tempo errors a plain autocorrelation peak is prone to

    Comparing against a fixed time ago (interpolated from recent frames) instead of
    against the previous frame, and expressing every time constant in seconds, keeps
    the result the same at 30, 60 or 144 fps.

    No DOM or Web Audio dependencies.

    Copyright © 2021 Anthony Stellato
*/

import { clamp } from '../Utils.js';
import {
    BEAT_WINDOW_SECONDS, BEAT_MARGIN, BEAT_FLUX_FLOOR, BEAT_REFRACTORY_SECONDS,
    BEAT_MIN_INTERVAL_SECONDS, BEAT_FLUX_LAG_SECONDS, BEAT_STATS_SECONDS,
    BEAT_RISE_CAP_DB, BEAT_MIN_FLUX_DB,
    TEMPO_RATE, TEMPO_SECONDS, TEMPO_MIN_BPM, TEMPO_MAX_BPM, TEMPO_COMB_TEETH,
    TEMPO_INTERVAL_SECONDS,
} from '../config.js';

/**
 * @typedef {{ onBeat: boolean, strength: number, location: number, band: number }} BeatPacket
 */

const MIN_POWER = 1e-12;
const DB_PER_LN = 10 / Math.LN10;

const ENVELOPE_RATE = TEMPO_RATE;       // Hz, fixed rate the flux is resampled to for tempo estimation
const ENVELOPE_SECONDS = TEMPO_SECONDS; // tempo estimation window
const MIN_BPM = TEMPO_MIN_BPM;
const MAX_BPM = TEMPO_MAX_BPM;
const COMB_TEETH = TEMPO_COMB_TEETH;    // a candidate beat period is scored at 1x .. 4x its lag
const FRAME_HISTORY = 32;               // recent frames kept for the fixed-lag comparison

function flatPacket(){
    return { onBeat: false, strength: 0, location: 0, band: 0 };
}

class BeatDetector {

    // Accepts either the upstream option object ({ margin, refractorySeconds, ... })
    // or a bare sample rate, so both call styles keep working.
    constructor(_options = {}){
        const options = (typeof _options === 'number' || _options === undefined)
            ? {} : (_options || {});

        this.sampleRate = options.sampleRate ?? 48000;
        this.fftSize = options.fftSize ?? 2048;

        this.subBandCount = options.subBandCount ?? 18;
        this.minFreq = options.minFreq ?? 30;
        this.maxFreq = options.maxFreq ?? 4000;            // Hz, kick and snare live below this; hi-hats above it are left out on purpose
        this.lowFreq = options.lowFreq ?? 150;             // Hz, sub bands below this get lowWeight
        this.lowWeight = options.lowWeight ?? 3;           // kick drums define the beat more than hi-hats do
        this.sensitivity = options.margin ?? BEAT_MARGIN;  // flux must exceed this multiple of its running mean...
        this.devWeight = 0.5;                              // ...plus this multiple of its running deviation...
        this.minFlux = BEAT_MIN_FLUX_DB;                   // dB of rise always required, so steady sound never fires
        this.riseCap = BEAT_RISE_CAP_DB;                   // dB, most a single sub band can contribute
        this.minInterval = options.refractorySeconds ?? BEAT_MIN_INTERVAL_SECONDS; // seconds between beats
        this.fluxLag = BEAT_FLUX_LAG_SECONDS;              // seconds, how far back the rise is measured from
        this.statsTime = BEAT_STATS_SECONDS;               // seconds, adaptive threshold memory
        this.gateDb = -75;                                 // sub bands quieter than this are ignored
        this.beatDecay = 0.25;                             // seconds, release of the beat pulse
        this.tempoInterval = TEMPO_INTERVAL_SECONDS;       // seconds between tempo estimates
        this.windowSeconds = options.windowSeconds ?? BEAT_WINDOW_SECONDS;
        this.levelsCount = options.levelsCount ?? 6;

        this.bandStart = new Uint16Array(this.subBandCount);
        this.bandEnd = new Uint16Array(this.subBandCount);
        this.bandWeight = new Float32Array(this.subBandCount);
        this.current = new Float32Array(this.subBandCount);     // dB per sub band, this frame
        // ring of recent frames (sub band dB and age) to look up the levels fluxLag seconds ago
        this.frames = new Float32Array(FRAME_HISTORY * this.subBandCount);
        this.frameAges = new Float32Array(FRAME_HISTORY);
        this.frameIndex = 0;

        // tempo estimation: ring buffer of flux at a fixed rate
        this.history = new Float32Array(ENVELOPE_RATE * ENVELOPE_SECONDS);
        this.linear = new Float32Array(this.history.length);    // scratch, oldest first
        this.minLag = Math.floor(ENVELOPE_RATE * 60 / MAX_BPM);
        this.maxLag = Math.ceil(ENVELOPE_RATE * 60 / MIN_BPM);
        this.correlation = new Float32Array(this.maxLag * COMB_TEETH + 2);

        // public state
        this.isOnBeat = false;  // true only on the frame a beat fires
        this.beat = 0;          // 1 on a beat, decaying to 0: ready to drive visuals
        this.flux = 0;          // onset strength this frame
        this.threshold = 0;     // what the flux had to clear
        this.bpm = 0;           // 0 until a tempo is found
        this.bpmConfidence = 0; // [0 - 1]
        this.beatCount = 0;
        this.framesSeen = 0;
        this.packet = flatPacket();
        this.prevSpectrum = new Float32Array(this.maxBin);

        this.computeBandEdges();
        this.reset();
    }

    get maxBin(){
        return this.bandEnd[this.subBandCount - 1];
    }

    computeBandEdges(binCount = this.fftSize / 2){
        this.binCountUsed = binCount;
        const binHz = this.sampleRate / this.fftSize;
        const maxFreq = Math.min(this.maxFreq, this.sampleRate / 2);
        // log spacing over the audible range, but clamped to the bins actually delivered
        // (the unit tests hand over a handful of bins instead of the full FFT)
        const usableBins = Math.min(binCount, Math.max(2, Math.round(maxFreq / binHz)));
        // never more bands than there are bins to fill them, or the edges collapse
        const active = Math.max(1, Math.min(this.subBandCount, usableBins - 1));
        this.activeBandCount = active;
        const ratio = Math.pow(usableBins / Math.max(1, Math.round(this.minFreq / binHz)), 1 / active);

        let start = Math.max(1, Math.min(usableBins - 1, Math.round(this.minFreq / binHz)));
        let weightSum = 0;
        for(let i = 0; i < active; i++){
            let end = Math.max(start + 1, Math.round(start * ratio));
            end = Math.min(end, binCount - (active - 1 - i));
            if(end <= start) end = Math.min(binCount, start + 1);
            this.bandStart[i] = start;
            this.bandEnd[i] = end;
            this.bandWeight[i] = (start * binHz < this.lowFreq) ? this.lowWeight : 1;
            weightSum += this.bandWeight[i];
            start = end;
        }
        // normalize so flux reads as "average dB rise per sub band"
        for(let i = 0; i < active; i++){
            this.bandWeight[i] /= weightSum;
        }
    }

    reset(){
        this.frames.fill(this.gateDb);
        this.frameAges.fill(0);
        this.frameIndex = 0;
        this.history.fill(0);
        this.historyIndex = 0;
        this.historyFilled = 0;
        this.slotTime = 0;      // time accumulated towards the next history slot
        this.slotPeak = 0;
        this.fluxMean = 0;
        this.fluxVar = 0;
        this.sinceBeat = this.minInterval;
        this.sinceTempo = 0;
        this.warmup = 0;
        this.isOnBeat = false;
        this.beat = 0;
        this.flux = 0;
        this.threshold = 0;
        this.bpm = 0;
        this.bpmConfidence = 0;
        this.packet = flatPacket();
        this.framesSeen = 0;
    }

    // power: linear power per FFT bin (|X|^2), deltaTime: seconds since the last update
    update(power, deltaTime){
        const bandCount = this.activeBandCount;
        const frames = this.frames;
        const ages = this.frameAges;
        const bins = power.length;

        // tests feed shorter spectra than the browser does; keep the centroid scratch
        // sized to whatever arrives, and recompute the band edges for that width
        if(this.prevSpectrum.length !== bins){
            this.prevSpectrum = new Float32Array(bins);
            this.computeBandEdges(bins);
            this.frames.fill(this.gateDb);
            this.frameAges.fill(0);
            this.frameIndex = 0;
        }

        // bin past the last sub band edge exist but carry no sub band
        const usable = Math.min(bins, this.bandEnd[bandCount - 1]);

        // age every stored frame, then find the two that bracket "fluxLag seconds ago"
        for(let i = 0; i < FRAME_HISTORY; i++) ages[i] += deltaTime;
        let newer = (this.frameIndex + FRAME_HISTORY - 1) % FRAME_HISTORY;  // most recent stored frame
        let older = newer;
        for(let i = 1; i < FRAME_HISTORY && ages[older] < this.fluxLag; i++){
            newer = older;
            older = (older + FRAME_HISTORY - 1) % FRAME_HISTORY;
        }
        const span = ages[older] - ages[newer];
        let mix = span > 0 ? (this.fluxLag - ages[newer]) / span : 1;   // 0 = newer, 1 = older
        if(mix < 0) mix = 0; else if(mix > 1) mix = 1;
        const newerOffset = newer * bandCount;
        const olderOffset = older * bandCount;

        // 1 + 2: weighted sum of each sub band's rise over the last fluxLag seconds.
        // The band's energy is the summed power of its bins, in dB: a rise is then
        // the same number of dB whatever the input gain.
        let flux = 0;
        for(let i = 0; i < bandCount; i++){
            let sum = 0;
            const start = this.bandStart[i];
            const end = Math.min(this.bandEnd[i], usable);
            for(let k = start; k < end; k++){
                sum += power[k];
            }
            let db = DB_PER_LN * Math.log(sum + MIN_POWER);
            if(db < this.gateDb) db = this.gateDb;
            this.current[i] = db;

            const before = frames[newerOffset + i] + (frames[olderOffset + i] - frames[newerOffset + i]) * mix;
            const rise = db - before;
            // capped: a quiet band coming out of silence is not a bigger event than a kick over a bass line
            if(rise > 0) flux += (rise < this.riseCap ? rise : this.riseCap) * this.bandWeight[i];
        }

        // the per-bin centroid of the rises gives the packet's location, kept in the
        // same units the scenes already read
        let centroidNum = 0;
        let centroidDen = 0;
        for(let k = 1; k < usable; k++){
            const rise = power[k] - this.prevSpectrum[k];
            if(rise > 0){
                centroidNum += k * rise;
                centroidDen += rise;
            }
        }
        for(let k = 0; k < bins; k++){
            this.prevSpectrum[k] = Number.isFinite(power[k]) ? power[k] : 0;
        }

        frames.set(this.current, this.frameIndex * bandCount);
        ages[this.frameIndex] = 0;
        this.frameIndex = (this.frameIndex + 1) % FRAME_HISTORY;
        this.flux = flux;

        // 3: adaptive threshold from the running mean and deviation of the flux
        const deviation = Math.sqrt(this.fluxVar);
        this.threshold = this.minFlux + this.sensitivity * this.fluxMean + this.devWeight * deviation;

        this.sinceBeat += deltaTime;
        this.warmup += deltaTime;
        this.framesSeen++;
        // the first moments after a start have no statistics yet: everything looks
        // like an onset. Both a time and a frame count keep slow callers working.
        const ready = this.warmup > 0.3 || this.framesSeen >= 6;
        this.isOnBeat = ready && flux > this.threshold && this.sinceBeat >= this.minInterval;

        const statsCoef = 1 - Math.exp(-deltaTime / this.statsTime);
        const diff = flux - this.fluxMean;
        this.fluxMean += diff * statsCoef;
        this.fluxVar += (diff * diff - this.fluxVar) * statsCoef;

        if(this.isOnBeat){
            this.sinceBeat = 0;
            this.beat = 1;
            this.beatCount++;
        } else {
            this.beat *= Math.exp(-deltaTime / this.beatDecay);
        }

        // 4: tempo
        this.pushHistory(flux, deltaTime);
        this.sinceTempo += deltaTime;
        if(this.sinceTempo >= this.tempoInterval){
            this.sinceTempo = 0;
            this.estimateTempo();
        }

        // packet consumed by the analyzer and the scenes
        let strength = 0;
        let location = 0;
        let band = 0;
        if(this.isOnBeat){
            strength = clamp((this.flux - this.threshold) / Math.max(this.threshold - this.minFlux, this.minFlux), 0, 1);
            location = centroidDen > 0
                ? clamp(centroidNum / centroidDen / (usable > 1 ? usable - 1 : 1), 0, 1 - 1e-6)
                : 0;
            band = Math.min(this.levelsCount - 1, Math.max(0, Math.floor(location * this.levelsCount)));
        }
        this.packet = { onBeat: this.isOnBeat, strength, location, band };
        return this.packet;
    }

    // resample the flux to a fixed rate, keeping the strongest value seen in each slot
    pushHistory(flux, deltaTime){
        const slot = 1 / ENVELOPE_RATE;
        if(flux > this.slotPeak) this.slotPeak = flux;
        this.slotTime += deltaTime;
        while(this.slotTime >= slot){
            this.slotTime -= slot;
            this.history[this.historyIndex] = this.slotPeak;
            this.historyIndex = (this.historyIndex + 1) % this.history.length;
            if(this.historyFilled < this.history.length) this.historyFilled++;
            // a frame longer than one slot fills the following slots too (sample and hold)
            if(this.slotTime < slot) this.slotPeak = 0;
        }
    }

    estimateTempo(){
        const n = this.history.length;
        // need a few beats of history before the estimate means anything
        if(this.historyFilled < ENVELOPE_RATE * 3){
            return;
        }

        // unroll the ring (oldest first) and remove the mean
        const count = this.historyFilled;
        const first = (this.historyIndex - count + n) % n;
        let mean = 0;
        for(let i = 0; i < count; i++){
            const v = this.history[(first + i) % n];
            this.linear[i] = v;
            mean += v;
        }
        mean /= count;
        let energy = 0;
        for(let i = 0; i < count; i++){
            this.linear[i] -= mean;
            energy += this.linear[i] * this.linear[i];
        }
        if(energy < 1e-6){
            this.bpmConfidence = 0;
            return;
        }

        // normalized autocorrelation, out to several times the slowest beat period
        const lagLimit = Math.min(this.maxLag * COMB_TEETH + 1, count - ENVELOPE_RATE);
        const corr = this.correlation;
        for(let lag = this.minLag - 1; lag <= lagLimit; lag++){
            let sum = 0;
            for(let i = lag; i < count; i++){
                sum += this.linear[i] * this.linear[i - lag];
            }
            // unbiased: fewer overlapping samples at longer lags
            corr[lag] = sum / (count - lag) * count / energy;
        }

        // comb score: a true beat period also correlates at 2x, 3x and 4x its lag.
        // Periods that are 2/3 or 3/2 of the real one only line up on some of those.
        let bestPeriod = 0;
        let bestScore = 0;
        for(let period = this.minLag; period <= this.maxLag; period += 0.25){
            let score = 0;
            let teeth = 0;
            for(let m = 1; m <= COMB_TEETH; m++){
                const lag = period * m;
                const whole = Math.floor(lag);
                if(whole + 1 > lagLimit) break;
                const frac = lag - whole;
                score += corr[whole] + (corr[whole + 1] - corr[whole]) * frac;
                teeth++;
            }
            if(teeth < 2) continue;
            const octaves = Math.log2(60 * ENVELOPE_RATE / period / 120) / 1.5;
            score = score / teeth * Math.exp(-0.5 * octaves * octaves);     // mild preference for mid tempos
            if(score > bestScore){
                bestScore = score;
                bestPeriod = period;
            }
        }
        if(bestPeriod === 0){
            this.bpmConfidence = 0;
            return;
        }

        // refine on the plain autocorrelation peak next to the winner (parabolic interpolation)
        let peakLag = Math.round(bestPeriod);
        if(corr[peakLag + 1] > corr[peakLag]) peakLag++;
        else if(corr[peakLag - 1] > corr[peakLag]) peakLag--;
        const a = corr[peakLag - 1], b = corr[peakLag], c = corr[peakLag + 1];
        const denom = a - 2 * b + c;
        let offset = denom < 0 ? 0.5 * (a - c) / denom : 0;
        if(!(offset > -1 && offset < 1)) offset = 0;
        const bpm = 60 * ENVELOPE_RATE / (peakLag + offset);

        this.bpmConfidence = Math.max(0, Math.min(1, b));
        if(this.bpmConfidence > 0.1){
            // settle towards a stable reading, but jump when the tempo really changed
            this.bpm = (this.bpm > 0 && Math.abs(bpm - this.bpm) < 3) ? this.bpm + (bpm - this.bpm) * 0.3 : bpm;
        }
    }
}

export { BeatDetector };
