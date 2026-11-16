/*
    sim.mjs - stand-ins for the Web Audio objects AudioAnalyzer needs, so it can run in Node

    MockAnalyser follows the AnalyserNode algorithm from the Web Audio spec:
    last fftSize samples -> Blackman window -> FFT -> |X| / N -> smoothing over time -> dB
*/

import { spawnSync } from 'node:child_process';

export const SAMPLE_RATE = 48000;

// decode any audio file ffmpeg understands to mono float samples at SAMPLE_RATE
export function decodeAudio(path){
    const result = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
        { maxBuffer: 2 ** 31 - 1 });
    if(result.error) throw new Error('could not run ffmpeg: ' + result.error.message);
    if(result.status !== 0) throw new Error('ffmpeg failed: ' + result.stderr.toString().trim());
    const out = result.stdout;
    return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength - out.byteLength % 4));
}

function fft(re, im){
    const n = re.length;
    for(let i = 1, j = 0; i < n; i++){
        let bit = n >> 1;
        for(; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if(i < j){
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for(let len = 2; len <= n; len <<= 1){
        const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
        for(let i = 0; i < n; i += len){
            let cr = 1, ci = 0;
            for(let k = 0; k < len / 2; k++){
                const a = i + k, b = a + len / 2;
                const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                re[b] = re[a] - xr; im[b] = im[a] - xi;
                re[a] += xr; im[a] += xi;
                const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
            }
        }
    }
}

export class MockAnalyser {

    constructor(pcm, sampleRate = SAMPLE_RATE){
        this.pcm = pcm;
        this.sampleRate = sampleRate;
        this._fftSize = 2048;
        this.smoothingTimeConstant = 0.8;
        this.minDecibels = -100;
        this.maxDecibels = -30;
        this.pos = 0;           // sample index of "now": the analysis window ends here
        this.lastPos = -1;
        this.allocate();
    }

    allocate(){
        const n = this._fftSize;
        this.re = new Float64Array(n);
        this.im = new Float64Array(n);
        this.window = new Float64Array(n);
        for(let i = 0; i < n; i++){
            this.window[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n);
        }
        this.smooth = new Float64Array(n / 2);
        this.db = new Float32Array(n / 2);
        this.lastPos = -1;
    }

    set fftSize(value){ this._fftSize = value; this.allocate(); }
    get fftSize(){ return this._fftSize; }
    get frequencyBinCount(){ return this._fftSize / 2; }

    // move playback to this time, in seconds
    setTime(seconds){
        this.pos = Math.floor(seconds * this.sampleRate);
    }

    sample(index){
        return index >= 0 && index < this.pcm.length ? this.pcm[index] : 0;
    }

    compute(){
        if(this.lastPos === this.pos) return;
        this.lastPos = this.pos;
        const n = this._fftSize, start = this.pos - n;
        for(let i = 0; i < n; i++){
            this.re[i] = this.sample(start + i) * this.window[i];
            this.im[i] = 0;
        }
        fft(this.re, this.im);
        const tau = this.smoothingTimeConstant;
        for(let k = 0; k < n / 2; k++){
            const magnitude = Math.hypot(this.re[k], this.im[k]) / n;
            this.smooth[k] = tau * this.smooth[k] + (1 - tau) * magnitude;
            this.db[k] = 20 * Math.log10(this.smooth[k]);
        }
    }

    getFloatFrequencyData(out){
        this.compute();
        out.set(this.db.subarray(0, out.length));
    }

    getByteFrequencyData(out){
        this.compute();
        const scale = 255 / (this.maxDecibels - this.minDecibels);
        for(let k = 0; k < out.length; k++){
            const v = scale * (this.db[k] - this.minDecibels);
            out[k] = !(v > 0) ? 0 : v > 255 ? 255 : Math.floor(v);
        }
    }

    getFloatTimeDomainData(out){
        const start = this.pos - this._fftSize;
        for(let i = 0; i < out.length; i++) out[i] = this.sample(start + i);
    }

    getByteTimeDomainData(out){
        const start = this.pos - this._fftSize;
        for(let i = 0; i < out.length; i++){
            out[i] = Math.max(0, Math.min(255, Math.floor(128 * (1 + this.sample(start + i)))));
        }
    }

    connect(){}
}

// the shape of the THREE.Audio object AudioAnalyzer is constructed with
export function mockAudio(pcm, sampleRate = SAMPLE_RATE){
    const analyser = new MockAnalyser(pcm, sampleRate);
    const audio = {
        context: { sampleRate, createAnalyser: () => analyser },
        connect(){},
        getOutput: () => ({ connect(){} }),
    };
    return { analyser, audio };
}

export function percentile(values, p){
    if(values.length === 0) return NaN;
    const sorted = Float64Array.from(values).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
