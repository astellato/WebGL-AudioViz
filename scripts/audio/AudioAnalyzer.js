/*
    AudioAnalyzer.js - class for analyzing audio data

	Takes in wave and FFT data, smooths out the values in a sliding average.
	Calculates peaks of sounds, returns normalized relative values between no sound and peak sound.
	Very robust at handling different audio sources and gain.
	Not the most perfect analysis but is performant and works well enough ¯\_(ツ)_/¯.

    Copyright © 2021 Anthony Stellato
*/

import { SlidingAverage } from '../SlidingAverage.js';
import { clamp, checkIsNan } from '../Utils.js';

class AudioAnalyzer {

	constructor( _audio,  _debug = false, _levelsCount = 6, _fftSize = 512 ) {

        this.audio = _audio;
		this.analyser = this.audio.context.createAnalyser(); 
		this.analyser.fftSize = _fftSize;
        this.analyser.smoothingTimeConstant = 0.3;

		this.freqByteData = new Uint8Array( this.analyser.frequencyBinCount ); // fft raw data
        this.timeByteData = new Uint8Array( this.analyser.frequencyBinCount ); // wave raw data
        this.binCount = this.analyser.frequencyBinCount;

        this.rawTotalPower = 0;
        this.levelsCount = _levelsCount;
        this.levelBins = Math.floor(this.analyser.frequencyBinCount/this.levelsCount);

        this.waveData = new Float32Array(this.binCount); // [0 - 1]
        this.binsData = new Float32Array(this.levelsCount); // [0 - 1]
		this.peaksData = new Float32Array(this.levelsCount); // [0 - 1]
		this.relativeData = new Float32Array(this.levelsCount);
		this.relativeTotal = 0;
		this.windowSize = 10;
		this.slidingAverages = [];
		this.totalSlidingAverage = new SlidingAverage(this.windowSize, 0.0);
		this.totalPeak = 0.1;
		this.peakDecay = 0.01; //0.002 //0.0001 //0.0005
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

		this.init();

	}

    setDrawEnabled(_enabled){
        this.drawEnabled = _enabled;
    }

    init(){
        //console.log("analyzer init");
        this.audio.getOutput().connect( this.analyser );

		// initialize peaks data
		for(let j = 0; j < this.levelsCount; j++){
			this.peaksData[j] = 0.1;
		}

		// initialize smoothed averages
		for(let k = 0; k < this.levelsCount; k++){
			this.slidingAverages.push(new SlidingAverage(this.windowSize, 0.0));
		}

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

    update(deltaTime){
        // GET RAW DATA
		this.analyser.getByteFrequencyData(this.freqByteData); //<-- bar chart
		this.analyser.getByteTimeDomainData(this.timeByteData); // <-- waveform

		for(let i = 0; i < this.timeByteData.length; i++){
			this.waveData[i] = (this.timeByteData[i] - 128) / 128;
		}

		// GENERATE DATA
		let adjustedPeakDecay = this.peakDecay * deltaTime;
		for(let i = 0; i < this.levelsCount; i++) {
			let sum = 0;
			for(let j = 0; j < this.levelBins; j++) {
				sum += this.freqByteData[(i * this.levelBins) + j];
			}
			let val = clamp(sum / this.levelBins/256, 0, 1);
			this.binsData[i] = val;
			this.peaksData[i] = clamp((val > this.peaksData[i]) ? val : this.peaksData[i] - adjustedPeakDecay, 0.1, 1);

			let rel = checkIsNan(clamp(val/this.peaksData[i], 0, 1));
			this.relativeData[i] = rel;
			this.slidingAverages[i].push(rel);
		}

		// GET AVG LEVEL
		let sum = 0;
		for(let i = 0; i < this.levelsCount; i++){
			sum += this.binsData[i];
		}
		this.rawTotalPower = checkIsNan(sum / this.levelsCount);
		this.totalSlidingAverage.push(this.rawTotalPower);
		this.totalPeak = clamp((this.rawTotalPower > this.totalPeak) ? this.rawTotalPower : this.totalPeak - adjustedPeakDecay, 0.1, 1);
		this.relativeTotal = this.totalPeak > 0.0 ? checkIsNan(this.totalSlidingAverage.getAverage()/this.totalPeak) : 0.0;

		// only draw the debug canvases while the debug overlay is actually visible
		if(this.isDebug && this.drawEnabled){
			this.debugDraw();
		}
	}

	getRelativeTotal(){
		return this.relativeTotal;
	}

	getAverage(idx){
		return this.slidingAverages[idx].getAverage() || 0.0;
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
			const val = this.peaksData[idx];
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
		rawCtx.fillRect(relativeMaxW, displayH, this.totalBarW, -this.rawTotalPower * displayH);

		// DRAW TOTAL PEAK
		rawCtx.beginPath();
		rawCtx.moveTo(relativeMaxW, displayH - this.totalPeak * displayH);
		rawCtx.lineTo(displayW, displayH - this.totalPeak * displayH);
		rawCtx.stroke();

		// DRAW AVERAGES
		const avgCtx = this.sAvgDisplayCtx;
		avgCtx.clearRect(0, 0, displayW, displayH);
		avgCtx.fillStyle = this.gradient;
		for(let idx = 0; idx < this.levelsCount; idx++){
			avgCtx.fillRect(idx * barWidth, displayH, barWidth - debugSpacing, -this.slidingAverages[idx].getAverage() * displayH);
		}

		// DRAW RELATIVE POWER
		avgCtx.fillStyle="#F00";
		avgCtx.fillRect(relativeMaxW, displayH, this.totalBarW, -this.relativeTotal * displayH);
	}

}

export { AudioAnalyzer };