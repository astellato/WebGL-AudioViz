/*
    AudioHandler.js - class for managing all sound related operations including analysis

    Copyright © 2021 Anthony Stellato

    TODO: Add file drop operations
*/

import * as THREE from 'https://cdn.skypack.dev/three@0.129.0';
import { AudioAnalyzer } from './AudioAnalyzer.js';

const DEFAULT_AUDIO_FILE = './audio/1048360_Creo---Drift.mp3';
const AUDIOINPUTS = Object.freeze({"DEFAULT":1, "MIC":2, "DROPMP3":3});

class AudioHandler {

    constructor(_selectedInput, _debug = false, _levelsCount = 6, _fftSize = 512){
        this.currentInput = _selectedInput;
        this.isAudioReady = false;
        this.fftSize = _fftSize;
        this.levelsCount = _levelsCount;
        this.audio = null;
        this.analyzer = null;
        this.listener = null;
        this.audioData = null;
        this.isOnBeat = false;
        this.gainSensitivity = 128;
        this.initAudio(_debug);
        
    }

    initAudio(_debug){
        this.listener = new THREE.AudioListener();
		this.audio = new THREE.Audio( this.listener );
        if(this.currentInput == AUDIOINPUTS.DEFAULT){
            this.useDefault();
        } else if(this.currentInput == AUDIOINPUTS.MIC){
            this.listener.gain.disconnect();
            this.useMic();
        }
        this.analyzer = new AudioAnalyzer(this.audio, _debug, this.levelsCount, this.fftSize);
    }

    update(deltaTime){
        this.analyzer.update(deltaTime);
    }

    stopAudio(){
        if(this.audio.isPlaying){
            this.audio.stop();
        }
    }

    restartAudio(){
        if(this.audio.isPlaying){
            this.audio.stop();
            this.audio.play();
        }
    }

    pauseResumeAudio(){
        (this.audio.isPlaying) ? this.audio.pause() : this.audio.play();
    }

    useMic(){
        if (!navigator.getUserMedia){
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
        }

        if (navigator.getUserMedia){

            navigator.getUserMedia({"audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
                }
            }, 
                function(stream) {
                    this.startMicrophone(stream);
                }.bind(this),
                function(e) {
                    alert('Error capturing audio.');
                }.bind(this)
            );

        } else { alert('getUserMedia not supported in this browser.'); }
    }

    startMicrophone(stream){
        this.audio.setMediaStreamSource(stream);
        //this.audio.source.disconnect( this.audio.getOutput() );
    }

    useDefault(){
        this.loadDefaultAudio();
    }

    onDropMP3(){

    }

    loadMP3(file){
        const loader = new THREE.AudioLoader();
        console.log('loading mp3 file: ' + file);
        loader.load( file,
            // onLoad callback
            (function ( buffer ) {
                console.log('load successful.');
                this.isAudioReady = true;
                this.audio.setBuffer( buffer );
                this.audio.play();
            }).bind(this),
            
            // // onProgress callback
            // function ( xhr ) {
            // 	console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
            // },

            // onError callback // will weirdly trigger during load???
            (function ( err ) {
                console.log( 'Error loading ' + file + " | error: " + err);
                this.isAudioReady = false;
            }).bind(this)
        );
    }

    loadDefaultAudio(){
        this.loadMP3(DEFAULT_AUDIO_FILE);
    }

    isPlaying(){
        return this.audio.isPlaying;
    }

}

export { AudioHandler, AUDIOINPUTS };