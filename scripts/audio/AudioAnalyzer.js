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

		this.init();

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
			this.waveformDisplayCtx = waveformCanvas.getContext('2d');
			this.waveformDisplayCtx.width = this.displayW;
			this.waveformDisplayCtx.height = this.displayH;
			this.waveformDisplayCtx.fillStyle = "rgb(40, 40, 40)";
			this.waveformDisplayCtx.lineWidth=2;
			this.waveformDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

			let sAvgDisplayCanvas = document.getElementById("audio-debug2");
			this.sAvgDisplayCtx = sAvgDisplayCanvas.getContext('2d');
			this.sAvgDisplayCtx.width = this.displayW;
			this.sAvgDisplayCtx.height = this.displayH;
			this.sAvgDisplayCtx.fillStyle = "rgb(40, 40, 40)";
			this.sAvgDisplayCtx.lineWidth=2;
			this.sAvgDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

			let rawCanvas = document.getElementById("audio-debug3");
			this.rawDisplayCtx = rawCanvas.getContext('2d');
			this.rawDisplayCtx.width = this.displayW;
			this.rawDisplayCtx.height = this.displayH;
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

		this.timeByteData.forEach((val, idx) => this.waveData[idx] = ((val - 128)/128));

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
		this.binsData.forEach((val) => sum += val);
		this.rawTotalPower = checkIsNan(sum / this.levelsCount);
		this.totalSlidingAverage.push(this.rawTotalPower);
		this.totalPeak = clamp((this.rawTotalPower > this.totalPeak) ? this.rawTotalPower : this.totalPeak - adjustedPeakDecay, 0.1, 1);
		this.relativeTotal = this.totalPeak > 0.0 ? checkIsNan(this.totalSlidingAverage.getAverage()/this.totalPeak) : 0.0;

		if(this.isDebug){
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

		//DRAW RELATIVE
		let relativeMaxW = this.displayW - this.totalBarW;
		let barWidth = relativeMaxW / this.levelsCount;
		let rawBarWidth = this.displayW / this.levelsCount;

		//DRAW WAVEFORM LINE
		this.waveformDisplayCtx.clearRect(0, 0, this.displayW, this.displayH);
		this.waveformDisplayCtx.strokeStyle = "rgb(255, 255, 255)";

		
		this.waveformDisplayCtx.beginPath();
		this.waveData.forEach((val, idx) => this.waveformDisplayCtx.lineTo(idx / this.binCount * this.displayW, val * this.displayH / 2 + this.displayH / 2));
		// for(let i = 0; i < this.binCount; i++) {
		// 	this.bottomDisplayCtx.lineTo(i/this.binCount*this.displayW, this.waveData[i]*this.displayH/2 + this.displayH/2);
		// }
		this.waveformDisplayCtx.stroke();

		// //DRAW VOLUME BAR + BEAT COLOR
		// if (this.beatTime < 1){
		// 	this.relativeDisplayCtx.fillStyle="#FFF";
		// }
		// this.relativeDisplayCtx.fillRect(relativeMaxW, this.displayH, this.totalBarW, -this.totalPower*this.displayH);

		// //DRAW CUT OFF LINE
		// this.relativeDisplayCtx.beginPath();
		// this.relativeDisplayCtx.strokeStyle = "rgb(255, 255, 255)";
		// this.relativeDisplayCtx.lineStyle="#FFF";
		// this.relativeDisplayCtx.moveTo(relativeMaxW , this.displayH - this.beatCutOff*this.displayH);
		// this.relativeDisplayCtx.lineTo(this.displayW, this.displayH - this.beatCutOff*this.displayH);
		// this.relativeDisplayCtx.stroke();

		// //DRAW SMOOTHED VOL LINE
		// this.relativeDisplayCtx.beginPath();
		// this.relativeDisplayCtx.strokeStyle = "rgb(0, 255, 0)";
		// this.relativeDisplayCtx.lineStyle="#0F0";
		// this.relativeDisplayCtx.moveTo(relativeMaxW , this.displayH-this.smoothedTotalPower*this.displayH);
		// this.relativeDisplayCtx.lineTo(this.displayW, this.displayH-this.smoothedTotalPower*this.displayH);
		// this.relativeDisplayCtx.stroke();

		//DRAW RAW AND PEAKS
		this.rawDisplayCtx.clearRect(0, 0, this.displayW, this.displayH);
		
		this.rawDisplayCtx.fillStyle = this.gradient;
		this.peaksData.forEach((val, idx) => {
			let startPt = idx*barWidth;
			let endPt = (idx + 1) * barWidth;
			this.rawDisplayCtx.fillRect(idx * barWidth, this.displayH, barWidth - this.debugSpacing, -this.binsData[idx]*this.displayH);
			this.rawDisplayCtx.beginPath();
		
			this.rawDisplayCtx.strokeStyle = "rgb(0, 255, 0)";

			this.rawDisplayCtx.lineStyle="#0F0";
			this.rawDisplayCtx.moveTo(startPt , this.displayH - val * this.displayH);
			this.rawDisplayCtx.lineTo(endPt - this.debugSpacing, this.displayH - val * this.displayH);
			this.rawDisplayCtx.stroke();
		});

		// DRAW TOTAL POWER
		this.rawDisplayCtx.fillStyle="#F00";
		this.rawDisplayCtx.fillRect(relativeMaxW, this.displayH, this.totalBarW, -this.rawTotalPower*this.displayH);

		// DRAW TOTAL PEAK
		this.rawDisplayCtx.lineStyle="#0F0";
		this.rawDisplayCtx.moveTo(this.displayW - this.totalBarW, this.displayH - this.totalPeak * this.displayH);
		this.rawDisplayCtx.lineTo(this.displayW, this.displayH - this.totalPeak * this.displayH);
		this.rawDisplayCtx.stroke();

		// DRAW AVERAGES
		this.sAvgDisplayCtx.clearRect(0, 0, this.displayW, this.displayH);
		this.sAvgDisplayCtx.fillStyle = this.gradient;
		this.slidingAverages.forEach((avg, idx) => 
			this.sAvgDisplayCtx.fillRect(idx * barWidth, this.displayH, barWidth - this.debugSpacing, -avg.getAverage() * this.displayH));

		// DRAW RELATIVE POWER
		this.sAvgDisplayCtx.fillStyle="#F00";
		this.sAvgDisplayCtx.fillRect(relativeMaxW, this.displayH, this.totalBarW, -this.relativeTotal*this.displayH);
	}

}

export { AudioAnalyzer };