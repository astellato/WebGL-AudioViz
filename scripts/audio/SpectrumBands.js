/*
    SpectrumBands.js - turns a power spectrum into a few normalized band levels

    Bands are log spaced (equal musical width) so each one carries real content,
    instead of linear slices where the first holds nearly all the music.
    Each band is measured as energy in dB, normalized against its own decaying
    peak (auto gain) and smoothed with a fast attack / slow release envelope.
    All time behaviour is in seconds, so it is independent of frame rate.

    No DOM or Web Audio dependencies: it can be driven from any spectrum source.
*/

const MIN_POWER = 1e-12;            // -120 dB, keeps log10 finite on digital silence
const DB_PER_LN = 10 / Math.LN10;   // 10 * log10(x) == DB_PER_LN * ln(x)

class SpectrumBands {

    constructor(_sampleRate, _fftSize, _bandCount = 6, _options = {}){
        this.sampleRate = _sampleRate;
        this.fftSize = _fftSize;
        this.bandCount = _bandCount;

        this.minFreq = _options.minFreq ?? 30;        // Hz, below this is rumble / DC
        this.maxFreq = _options.maxFreq ?? 16000;     // Hz, above this lossy codecs and mics are empty
        this.rangeDb = _options.rangeDb ?? 30;        // dB below the peak that maps to 0
        this.peakDecayDb = _options.peakDecayDb ?? 2; // dB per second the auto gain recovers
        this.floorDb = _options.floorDb ?? -70;       // peaks never drop below this, so noise is not blown up to full scale
        this.attack = _options.attack ?? 0.025;       // seconds
        this.release = _options.release ?? 0.18;      // seconds

        this.bandStart = new Uint16Array(this.bandCount);   // first bin (inclusive)
        this.bandEnd = new Uint16Array(this.bandCount);     // last bin (exclusive)
        this.bandFreqs = new Float32Array(this.bandCount + 1);

        this.dbData = new Float32Array(this.bandCount);         // band energy, dB
        this.peaksDb = new Float32Array(this.bandCount);        // decaying peak, dB
        this.relativeData = new Float32Array(this.bandCount);   // instant level [0 - 1]
        this.levels = new Float32Array(this.bandCount);         // smoothed level [0 - 1]

        this.totalDb = this.floorDb;
        this.totalPeakDb = this.floorDb;
        this.relativeTotal = 0;     // instant [0 - 1]
        this.total = 0;             // smoothed [0 - 1]

        this.computeBandEdges();
        this.reset();
    }

    // one past the highest bin any band reads; callers only need to fill power[0 .. maxBin)
    get maxBin(){
        return this.bandEnd[this.bandCount - 1];
    }

    computeBandEdges(){
        const binHz = this.sampleRate / this.fftSize;
        const binCount = this.fftSize / 2;
        const maxFreq = Math.min(this.maxFreq, this.sampleRate / 2);
        const ratio = Math.pow(maxFreq / this.minFreq, 1 / this.bandCount);

        let start = Math.max(1, Math.round(this.minFreq / binHz));  // never include the DC bin
        for(let i = 0; i < this.bandCount; i++){
            const edge = this.minFreq * Math.pow(ratio, i + 1);
            // every band gets at least one bin, even when the FFT is too coarse for the low end
            let end = Math.max(start + 1, Math.round(edge / binHz));
            end = Math.min(end, binCount - (this.bandCount - 1 - i));
            this.bandStart[i] = start;
            this.bandEnd[i] = end;
            this.bandFreqs[i] = start * binHz;
            this.bandFreqs[i + 1] = end * binHz;
            start = end;
        }
    }

    reset(){
        this.dbData.fill(this.floorDb - this.rangeDb);
        this.peaksDb.fill(this.floorDb);
        this.relativeData.fill(0);
        this.levels.fill(0);
        this.totalDb = this.floorDb - this.rangeDb;
        this.totalPeakDb = this.floorDb;
        this.relativeTotal = 0;
        this.total = 0;
    }

    // power: linear power per FFT bin (|X|^2), deltaTime: seconds since the last update
    update(power, deltaTime){
        const decay = this.peakDecayDb * deltaTime;
        const attackCoef = 1 - Math.exp(-deltaTime / this.attack);
        const releaseCoef = 1 - Math.exp(-deltaTime / this.release);
        const invRange = 1 / this.rangeDb;

        let dbSum = 0;
        for(let i = 0; i < this.bandCount; i++){
            let sum = 0;
            for(let k = this.bandStart[i], end = this.bandEnd[i]; k < end; k++){
                sum += power[k];
            }
            const db = DB_PER_LN * Math.log(sum + MIN_POWER);
            this.dbData[i] = db;
            dbSum += db;

            let peak = this.peaksDb[i] - decay;
            if(db > peak) peak = db;
            if(peak < this.floorDb) peak = this.floorDb;
            this.peaksDb[i] = peak;

            let rel = 1 + (db - peak) * invRange;
            if(!(rel > 0)) rel = 0;     // also catches NaN
            this.relativeData[i] = rel;

            const level = this.levels[i];
            this.levels[i] = level + (rel - level) * (rel > level ? attackCoef : releaseCoef);
        }

        // overall loudness: the mean of the band levels in dB, so every band counts
        // equally instead of the bass (which holds most of the energy) deciding alone
        this.totalDb = dbSum / this.bandCount;
        let totalPeak = this.totalPeakDb - decay;
        if(this.totalDb > totalPeak) totalPeak = this.totalDb;
        if(totalPeak < this.floorDb) totalPeak = this.floorDb;
        this.totalPeakDb = totalPeak;

        let rel = 1 + (this.totalDb - totalPeak) * invRange;
        if(!(rel > 0)) rel = 0;
        this.relativeTotal = rel;
        this.total += (rel - this.total) * (rel > this.total ? attackCoef : releaseCoef);
    }
}

export { SpectrumBands };
