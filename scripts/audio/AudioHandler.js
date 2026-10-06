/*
    AudioHandler.js - class for managing all sound related operations including analysis

    Copyright © 2021 Anthony Stellato

    TODO: Add file drop operations
*/

import * as THREE from 'three';
import { AudioAnalyzer } from './AudioAnalyzer.js';

const DEFAULT_AUDIO_FILE = './audio/1048360_Creo---Drift.mp3';
const AUDIOINPUTS = Object.freeze({"DEFAULT":1, "MIC":2, "DROPMP3":3});

// The start overlay is removed once init() runs, so load failures after that point
// would otherwise be invisible. Show them in a small banner instead of alert().
function showAudioError(message){
    let banner = document.getElementById('audio-error');
    if(!banner){
        banner = document.createElement('div');
        banner.id = 'audio-error';
        document.body.appendChild(banner);
    }
    banner.textContent = message;
    banner.style.display = 'block';
}

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

    // Browsers start the AudioContext suspended until a user gesture allows audio.
    // Call this from click/key handlers (and before play()) or playback stays silent.
    resumeAudioContext(){
        const context = this.listener && this.listener.context;
        if(context && context.state === 'suspended'){
            context.resume();
        }
    }

    stopAudio(){
        if(this.audio.isPlaying){
            this.audio.stop();
        }
    }

    restartAudio(){
        // Only the default (buffer) input has playback control; mic input is
        // a live stream and intentionally left alone here, as before.
        if(this.currentInput !== AUDIOINPUTS.DEFAULT || !this.isAudioReady){
            return;
        }
        if(this.audio.isPlaying){
            this.audio.stop();
        }
        // (Re)start from the top. With looping enabled the track normally
        // never ends; this also recovers playback if it ever does stop.
        this.audio.play();
    }

    pauseResumeAudio(){
        this.resumeAudioContext();
        (this.audio.isPlaying) ? this.audio.pause() : this.audio.play();
    }

    useMic(){
        if (!navigator.mediaDevices?.getUserMedia){
            showAudioError('getUserMedia not supported in this browser.');
            return;
        }

        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        }).then((stream) => {
            this.startMicrophone(stream);
        }).catch((error) => {
            console.error('Error capturing audio.', error);
            showAudioError('Error capturing audio: ' + (error.message || error));
        });
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
            ( buffer ) => {
                console.log('load successful.');
                this.isAudioReady = true;
                this.audio.setBuffer( buffer );
                this.audio.play();
            },

            // onProgress callback (none needed; keep the slot so onError lands 4th.
            // passing the error handler here used to fire it on every progress event)
            undefined,

            // onError callback
            ( err ) => {
                console.error( 'Error loading ' + file + " | error: " + err);
                this.isAudioReady = false;
                showAudioError('Could not load audio: ' + file);
            }
        );
    }

    loadDefaultAudio(){
        // The visualizer is meant to run indefinitely; loop the track so the
        // render loop (gated on isPlaying) never stalls at the end of the file.
        this.audio.setLoop(true);
        this.loadMP3(DEFAULT_AUDIO_FILE);
    }

    isPlaying(){
        return this.audio.isPlaying;
    }

}

export { AudioHandler, AUDIOINPUTS };