/*
    AudioHandler.js - class for managing all sound related operations including analysis

    Owns the audio graph. A persistent "bus" GainNode is what the analyzer (and
    Butterchurn) attach to, once; whichever source is active - the bundled track,
    the mic, or a shared tab - feeds that bus. Switching a source crossfades the
    feed, so consumers never have to re-point and no reload is needed.

    Copyright © 2021 Anthony Stellato

    TODO: Add file drop operations
*/

import * as THREE from 'three';
import { AudioAnalyzer } from './AudioAnalyzer.js';
import { AUDIOINPUTS, CHOOSABLE_SOURCES } from './audioSources.js';
import { AUDIO_FADE_SECONDS } from '../config.js';

const DEFAULT_AUDIO_FILE = './audio/1048360_Creo---Drift.mp3';

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

    constructor({ debug = false, levelsCount = 6, fftSize = 512 } = {}) {
        this.listener = new THREE.AudioListener();
        this.audio = new THREE.Audio( this.listener );
        // The bus: everything downstream attaches here once. It is never wired
        // to the speakers, so live mic/tab audio is analyzed but not re-output.
        this.bus = this.listener.context.createGain();
        this.analyzer = new AudioAnalyzer(this.bus, debug, levelsCount, fftSize);

        this.onSourceEnded = null;

        this._currentSource = AUDIOINPUTS.NONE;
        this._active = null;         // { source, gainParam, gainNode?, sourceNode?, stream? }
        this._switchToken = 0;
        this._defaultLoaded = false;
        this._defaultConnectDone = false;
    }

    get context(){
        return this.listener.context;
    }

    getOutput(){
        return this.bus;
    }

    getSource(){
        return this._currentSource;
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

    isPlaying(){
        if(this._currentSource === AUDIOINPUTS.MIC || this._currentSource === AUDIOINPUTS.TAB){
            return true;
        }
        if(this._currentSource === AUDIOINPUTS.DEFAULT){
            return this.audio.isPlaying;
        }
        return false;
    }

    // Transport controls belong to the bundled track; live sources have none.
    pauseResumeAudio(){
        if(this._currentSource !== AUDIOINPUTS.DEFAULT) return;
        this.resumeAudioContext();
        (this.audio.isPlaying) ? this.audio.pause() : this.audio.play();
    }

    restartAudio(){
        if(this._currentSource !== AUDIOINPUTS.DEFAULT || !this._defaultLoaded) return;
        if(this.audio.isPlaying){
            this.audio.stop();
        }
        this.audio.play();
    }

    /**
     * Switch the live source. Acquires and validates the new source before
     * touching the current one, so a cancelled picker or denied prompt leaves
     * it playing untouched.
     *
     * @param {number} input one of AUDIOINPUTS.DEFAULT / MIC / TAB
     * @returns {Promise<{ok: boolean, source?: number, error?: string, cancelled?: boolean}>}
     */
    async setSource(input){
        if(!CHOOSABLE_SOURCES.includes(input)){
            return { ok:false, error: 'Unknown audio source.' };
        }
        if(input === this._currentSource && this._active){
            return { ok:true, source: input };
        }

        const token = ++this._switchToken;

        let acquired;
        try {
            acquired = await this._acquire(input);
        } catch(error){
            const message = (error && error.message) ? error.message : 'Could not start that audio source.';
            showAudioError(message);
            return { ok:false, error: message };
        }

        if(token !== this._switchToken){
            // A newer switch won the race; discard what we just acquired.
            this._releaseAcquired(acquired);
            return { ok:false, cancelled:true };
        }

        this._connect(input, acquired);
        this._currentSource = input;
        return { ok:true, source: input };
    }

    _acquire(input){
        if(input === AUDIOINPUTS.DEFAULT) return this._acquireDefault();
        if(input === AUDIOINPUTS.MIC) return this._acquireMic();
        if(input === AUDIOINPUTS.TAB) return this._acquireTab();
        return Promise.reject(new Error('Unknown audio source.'));
    }

    _acquireDefault(){
        if(this._defaultLoaded) return Promise.resolve({ kind: 'default' });
        return new Promise((resolve, reject) => {
            const loader = new THREE.AudioLoader();
            loader.load( DEFAULT_AUDIO_FILE,
                ( buffer ) => {
                    this.audio.setBuffer( buffer );
                    this.audio.setLoop( true );
                    this._defaultLoaded = true;
                    resolve({ kind: 'default' });
                },
                undefined,
                () => reject(new Error('Could not load audio: ' + DEFAULT_AUDIO_FILE))
            );
        });
    }

    _acquireMic(){
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
            return Promise.reject(new Error('getUserMedia not supported in this browser.'));
        }
        return navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        }).then((stream) => ({ kind: 'stream', stream }));
    }

    _acquireTab(){
        if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
            return Promise.reject(new Error('Tab audio capture is not supported in this browser.'));
        }
        const request = (constraints) => navigator.mediaDevices.getDisplayMedia(constraints);
        // Prefer audio-only. Fall back to requesting a video surface only when the
        // browser rejects the constraints themselves; a user cancel
        // (NotAllowedError) must not re-open the picker.
        return request({ audio: true, video: false })
            .catch((error) => {
                if(error && error.name === 'TypeError') return request({ audio: true, video: true });
                throw error;
            })
            .then((stream) => {
                for(const video of (stream.getVideoTracks ? stream.getVideoTracks() : [])){
                    try { video.stop(); } catch { /* already gone */ }
                }
                const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
                if(audioTracks.length === 0){
                    this._stopStream(stream);
                    throw new Error('No audio was shared. Tick "Share tab audio" in the picker.');
                }
                return { kind: 'stream', stream, audioTrack: audioTracks[0] };
            });
    }

    _connect(input, acquired){
        const now = this.context.currentTime;
        const old = this._active;

        const feed = this._buildFeed(input, acquired);

        // Crossfade: new feed in from 0, old feed out to 0 over AUDIO_FADE_SECONDS.
        if(feed.gainParam){
            feed.gainParam.cancelScheduledValues(now);
            feed.gainParam.setValueAtTime(old ? 0 : 1, now);
            if(old) feed.gainParam.linearRampToValueAtTime(1, now + AUDIO_FADE_SECONDS);
        }
        if(old){
            const oldGain = old.gainParam;
            if(oldGain){
                oldGain.cancelScheduledValues(now);
                oldGain.setValueAtTime(oldGain.value, now);
                oldGain.linearRampToValueAtTime(0, now + AUDIO_FADE_SECONDS);
            }
            setTimeout(() => this._teardown(old), AUDIO_FADE_SECONDS * 1000);
        }

        this._active = feed;
    }

    _buildFeed(input, acquired){
        if(input === AUDIOINPUTS.DEFAULT){
            // The audio's own gain already feeds the listener (speakers); tap it
            // into the bus once so the analyzer can see it too.
            if(!this._defaultConnectDone){
                this.audio.getOutput().connect(this.bus);
                this._defaultConnectDone = true;
            }
            this.audio.play();
            return { source: input, gainParam: this.audio.gain.gain };
        }

        const gainNode = this.context.createGain();
        const sourceNode = this.context.createMediaStreamSource(acquired.stream);
        sourceNode.connect(gainNode);
        gainNode.connect(this.bus);

        if(input === AUDIOINPUTS.TAB && acquired.audioTrack){
            // The browser's own "Stop sharing" ends the track; react to that.
            acquired.audioTrack.onended = () => this._handleExternalEnd(input);
        }

        return { source: input, gainParam: gainNode.gain, gainNode, sourceNode, stream: acquired.stream };
    }

    // The user ended sharing from the browser's UI (not by switching source).
    // Our own teardown nulls onended first, so this only fires for a real end.
    _handleExternalEnd(input){
        if(this._currentSource !== input || !this._active || this._active.source !== input) return;
        const feed = this._active;
        this._active = null;
        this._currentSource = AUDIOINPUTS.NONE;
        this._stopStream(feed.stream);
        if(feed.sourceNode && feed.sourceNode.disconnect) feed.sourceNode.disconnect();
        if(feed.gainNode && feed.gainNode.disconnect) feed.gainNode.disconnect();
        if(typeof this.onSourceEnded === 'function') this.onSourceEnded();
    }

    _teardown(feed){
        if(!feed) return;
        // A deferred teardown can fire after a newer switch; never tear down the
        // feed that is now active (e.g. default re-selected within the fade).
        if(this._active === feed) return;
        if(feed.source === AUDIOINPUTS.DEFAULT){
            // Stop the shared track only if the default isn't the live source again.
            if(this._currentSource !== AUDIOINPUTS.DEFAULT) this.audio.pause();
            return;
        }
        this._stopStream(feed.stream);
        if(feed.sourceNode && feed.sourceNode.disconnect) feed.sourceNode.disconnect();
        if(feed.gainNode && feed.gainNode.disconnect) feed.gainNode.disconnect();
    }

    // Stop every track of a stream, clearing handlers first so an intentional
    // stop does not trip the browser's own "sharing ended" path.
    _stopStream(stream){
        if(!stream || !stream.getTracks) return;
        for(const track of stream.getTracks()){
            track.onended = null;
            try { track.stop(); } catch { /* already stopped */ }
        }
    }

    _releaseAcquired(acquired){
        if(acquired && acquired.stream) this._stopStream(acquired.stream);
    }
}

export { AudioHandler, AUDIOINPUTS };
