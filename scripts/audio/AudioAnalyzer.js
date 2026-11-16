/*
    AudioAnalyzer.js - class for analyzing audio data

	Takes a source AudioNode (the AudioHandler bus) and creates its own
	AnalyserNode on it. Reads the FFT once per frame and derives:
	  - a few log spaced band levels, each normalized against its own decaying
	    peak (so it adapts to any source and gain) with a fast attack / slow
	    release
	  - an overall level
	  - the normalized spectrum scenes read, and a beat packet (see BeatDetector)
	Very robust at handling different audio sources and gain.

	The spectrum is read as float dB rather than bytes: bytes are quantized to 8
	bits and clip everything louder than -30 dB, which flattens exactly the loud
	low end that matters most. All smoothing is time based, so results do not
	depend on fps. A byte fallback keeps older fakes working.

    Copyright © 2021 Anthony Stellato
*/

import { clamp, checkIsNan } from '../Utils.js';
import { SpectrumBands } from './SpectrumBands.js';
import { BeatDetector } from './BeatDetector.js';
import {
    BEAT_WINDOW_SECONDS, BEAT_MARGIN, BEAT_FLUX_FLOOR, BEAT_REFRACTORY_SECONDS,
} from '../config.js';

const BYTE_FLOOR_DB = -100;     // minDecibels: the bottom of the byte scale
const BYTE_CEIL_DB = -30;       // maxDecibels: the top, which byte data clips at
const BYTE_SPAN_DB = BYTE_CEIL_DB - BYTE_FLOOR_DB;   // 70 dB
const MIN_POWER = 1e-12;        // -120 dB, keeps log10 finite on digital silence
const DB_PER_LN = 10 / Math.LN10;   // 10 * log10(x) == DB_PER_LN * ln(x)

class AudioAnalyzer {

	constructor( _sourceNode,  _debug = false, _levelsCount = 6, _fftSize = 512 ) {

        this.sourceNode = _sourceNode;
		this.analyser = this.sourceNode.context.createAnalyser(); 
		this.analyser.fftSize = _fftSize;
        // no smoothing in the node: it is applied per call (so it depends on fps) and it
        // blurs the onsets the beat detector needs. Bands are smoothed in SpectrumBands.
        this.analyser.smoothingTimeConstant = 0.3;

		this.freqByteData = new Uint8Array( this.analyser.frequencyBinCount ); // byte fft, fallback
        this.timeByteData = new Uint8Array( this.analyser.frequencyBinCount ); // wave raw data
        this.binCount = this.analyser.frequencyBinCount;
        this.spectrum = new Float32Array( this.binCount ); // normalized magnitude spectrum (0..1)

        this.rawTotalPower = 0;
        this.levelsCount = _levelsCount;

        const sampleRate = this.sourceNode.context.sampleRate || 48000;
        this.bands = new SpectrumBands(sampleRate, _fftSize, _levelsCount);
        // bins above the highest band are never read, so they are never converted either
        this.usedBins = Math.min(this.binCount, this.bands.maxBin);

		this.freqData = new Float32Array( this.binCount );  // fft raw data, dB
        this.powerData = new Float32Array( this.binCount ); // fft as linear power
        this.waveData = new Float32Array(this.binCount); // [-1 - 1], debug display only
        this.binsData = new Float32Array(this.levelsCount); // [0 - 1], debug display only
		this.peaksData = this.bands.peaksDb;                // decaying peak, debug display only
		this.relativeData = this.bands.relativeData;        // instant level relative to the peak
		this.relativeTotal = 0;
		this.relativeDisplayCtx = null;
		this.rawDisplayCtx = null;
		this.waveformDisplayCtx = null;
		this.sAvgDisplayCtx = null;
		this.totalBarW = 40;
		this.displayH = 100;
		this.displayW = 250;
		this.debugSpacing = 2;
		this.gradient = null;
		this.isDebug = _debug;
		this.drawEnabled = false; // debug canvases are hidden until the overlay is shown

		this.beatDetector = new BeatDetector({
			windowSeconds: BEAT_WINDOW_SECONDS,
			margin: BEAT_MARGIN,
			floor: BEAT_FLUX_FLOOR,
			refractorySeconds: BEAT_REFRACTORY_SECONDS,
			levelsCount: this.levelsCount,
			sampleRate,
			fftSize: _fftSize,
		});

		this.init();

	}

    setDrawEnabled(_enabled){
        this.drawEnabled = _enabled;
    }

    init(){
        //console.log("analyzer init");
        this.sourceNode.connect( this.analyser );

		if(this.isDebug){
			//INIT DEBUG DRAW

			let waveformCanvas = document.getElementById("audio-debug1");
			waveformCanvas.width = this.displayW;
			waveformCanvas.height = this.displayH;
			this.waveformDisplayCtx = waveformCanvas.getContext('2d');
			this.waveformDisplayCtx.fillStyle = "rgb(40, 40, 40)";
			this.waveformDisplayCtx.lineWidth=2;
			this.waveformDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

			let sAvgDisplayCanvas = document.getElementById("audio-debug2");
			sAvgDisplayCanvas.width = this.displayW;
			sAvgDisplayCanvas.height = this.displayH;
			this.sAvgDisplayCtx = sAvgDisplayCanvas.getContext('2d');
			this.sAvgDisplayCtx.fillStyle = "rgb(40, 40, 40)";
			this.sAvgDisplayCtx.lineWidth=2;
			this.sAvgDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

			let rawCanvas = document.getElementById("audio-debug3");
			rawCanvas.width = this.displayW;
			rawCanvas.height = this.displayH;
			this.rawDisplayCtx = rawCanvas.getContext('2d');
			this.rawDisplayCtx.fillStyle = "rgb(40, 40, 40)";
			this.rawDisplayCtx.lineWidth=2;
			this.rawDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

			this.gradient = this.waveformDisplayCtx.createLinearGradient(0,0,0,this.displayH)
			this.gradient.addColorStop(1,'#dddd00'); // 1
			this.gradient.addColorStop(0.5,'#bbdd00'); // .5
			this.gradient.addColorStop(0,'#99dd00'); // 0
		}
    }

    // Reads the FFT into linear power bins. Float dB is preferred; a byte-only
    // AnalyserNode (older fakes) falls back to the byte scale.
    readPower(){
        const analyser = this.analyser;
        this.usingFloat = typeof analyser.getFloatFrequencyData === 'function';
        if(this.usingFloat){
            analyser.getFloatFrequencyData(this.freqData);
            for(let i = 0; i < this.usedBins; i++){
                const db = this.freqData[i];
                this.powerData[i] = Number.isFinite(db) ? Math.exp(db * Math.LN10 / 10) : 0;
            }
        } else {
            analyser.getByteFrequencyData(this.freqByteData);
            for(let i = 0; i < this.usedBins; i++){
                const db = BYTE_FLOOR_DB + (this.freqByteData[i] / 255) * BYTE_SPAN_DB;
                this.powerData[i] = Math.exp(db * Math.LN10 / 10);
            }
        }
        // bins past usedBins are never read, but clear them so nothing stale is summed
        this.powerData.fill(0, this.usedBins);
    }

    // Normalized magnitude spectrum scenes read, 0..1. With float data it maps the
    // dB scale onto the same window byte data uses (minDecibels..maxDecibels), so
    // callers see the contract they already relied on, without the 8-bit clipping.
    updateSpectrum(){
        if(this.usingFloat){
            for(let i = 0; i < this.binCount; i++){
                const db = DB_PER_LN * Math.log(this.powerData[i] + MIN_POWER);
                this.spectrum[i] = Number.isFinite(db) ? clamp((db - BYTE_FLOOR_DB) / BYTE_SPAN_DB, 0, 1) : 0;
            }
        } else {
            for(let i = 0; i < this.binCount; i++){
                this.spectrum[i] = this.freqByteData[i] / 255;
            }
        }
    }

    update(deltaTime){
        // GET RAW DATA
		this.readPower();
		this.analyser.getByteTimeDomainData(this.timeByteData); // <-- waveform

		for(let i = 0; i < this.timeByteData.length; i++){
			this.waveData[i] = (this.timeByteData[i] - 128) / 128;
		}

		// GENERATE BAND LEVELS
		this.bands.update(this.powerData, deltaTime);
		this.relativeTotal = checkIsNan(this.bands.relativeTotal);
		this.rawTotalPower = checkIsNan(this.bands.totalDb);

		// debug display only: absolute dB mapped onto [0 - 1]
		for(let i = 0; i < this.levelsCount; i++){
			const db = this.bands.dbData[i];
			this.binsData[i] = clamp(1 + (db - this.bands.peaksDb[i]) / this.bands.rangeDb, 0, 1);
		}

		// NORMALIZED SPECTRUM + BEAT DETECTION
		this.updateSpectrum();
		// the detector gets linear power, which keeps the full dynamic range that
		// the normalized 0..1 spectrum would compress away
		this.beatDetector.update(this.powerData, deltaTime);

		// only draw the debug canvases while the debug overlay is actually visible
		if(this.isDebug && this.drawEnabled){
			this.debugDraw();
		}
	}

	getRelativeTotal(){
		return this.relativeTotal;
	}

	getAverage(idx){
		return this.bands.levels[idx] || 0.0;
	}

	getSpectrum(){
		return this.spectrum;
	}

	getBeat(){
		return this.beatDetector.packet;
	}

	// True only on the frame a beat fired (the harness and debug tools read this).
	isOnBeat(){
		return this.beatDetector.packet.onBeat;
	}

	// Current tempo estimate, in BPM (0 until a tempo is found).
	getBpm(){
		return this.beatDetector.bpm;
	}

	debugDraw(){

		const displayW = this.displayW;
		const displayH = this.displayH;
		const debugSpacing = this.debugSpacing;

		//DRAW RELATIVE
		let relativeMaxW = displayW - this.totalBarW;
		let barWidth = relativeMaxW / this.levelsCount;

		//DRAW WAVEFORM LINE
		const waveCtx = this.waveformDisplayCtx;
		waveCtx.clearRect(0, 0, displayW, displayH);
		waveCtx.beginPath();
		waveCtx.moveTo(0, this.waveData[0] * displayH / 2 + displayH / 2);
		for(let i = 1; i < this.binCount; i++) {
			waveCtx.lineTo(i / this.binCount * displayW, this.waveData[i] * displayH / 2 + displayH / 2);
		}
		waveCtx.stroke();

		//DRAW RAW AND PEAKS
		const rawCtx = this.rawDisplayCtx;
		rawCtx.clearRect(0, 0, displayW, displayH);
		rawCtx.fillStyle = this.gradient;
		rawCtx.strokeStyle = "rgb(0, 255, 0)";
		for(let idx = 0; idx < this.levelsCount; idx++){
			const val = clamp(1 + (this.bands.peaksDb[idx] - this.bands.dbData[idx]) / this.bands.rangeDb, 0, 1);
			const startPt = idx * barWidth;
			const endPt = (idx + 1) * barWidth;
			rawCtx.fillRect(startPt, displayH, barWidth - debugSpacing, -this.binsData[idx] * displayH);
			rawCtx.beginPath();
			rawCtx.moveTo(startPt, displayH - val * displayH);
			rawCtx.lineTo(endPt - debugSpacing, displayH - val * displayH);
			rawCtx.stroke();
		}

		// DRAW TOTAL POWER
		rawCtx.fillStyle="#F00";
		rawCtx.fillRect(relativeMaxW, displayH, this.totalBarW, -this.binsData[0] * displayH);

		// DRAW TOTAL PEAK
		rawCtx.beginPath();
		rawCtx.moveTo(relativeMaxW, displayH - this.bands.total * displayH);
		rawCtx.lineTo(displayW, displayH - this.bands.total * displayH);
		rawCtx.stroke();

		// DRAW AVERAGES
		const avgCtx = this.sAvgDisplayCtx;
		avgCtx.clearRect(0, 0, displayW, displayH);
		avgCtx.fillStyle = this.gradient;
		for(let idx = 0; idx < this.levelsCount; idx++){
			avgCtx.fillRect(idx * barWidth, displayH, barWidth - debugSpacing, -this.bands.levels[idx] * displayH);
		}

		// DRAW RELATIVE POWER
		avgCtx.fillStyle="#F00";
		avgCtx.fillRect(relativeMaxW, displayH, this.totalBarW, -this.relativeTotal * displayH);

		// DRAW BPM AND BEAT INDICATOR (pulse on onset, positioned at the spectral location)
		const beat = this.beatDetector.packet;
		avgCtx.fillStyle = "#ffdd00";
		avgCtx.font = "12px monospace";
		const bpm = this.beatDetector.bpm;
		avgCtx.fillText(bpm > 0 ? Math.round(bpm) + " BPM" : "-- BPM", 4, 14);
		if(beat.onBeat){
			avgCtx.beginPath();
			avgCtx.arc(beat.location * displayW, 24, 4 + beat.strength * 8, 0, Math.PI * 2);
			avgCtx.fill();
		}
	}

}

export { AudioAnalyzer };