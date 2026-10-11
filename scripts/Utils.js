/*
    Utils.js - utility functions

    Copyright © 2021 Anthony Stellato
*/

function isMobile(){
    // NOTE: no /g flag here - global regexes are stateful across .test() calls
    return /(iPad|iPhone|iPod|Android|webOS|BlackBerry|Windows Phone)/i.test( navigator.userAgent );
}

function isIOS(){
    return /(iPad|iPhone|iPod)/i.test( navigator.userAgent );
}

const clamp = (num, min, max) => {
    return Math.min(Math.max(num, min), max);
}

const checkIsNan = (num) => {
    return (Number.isNaN(num)) ? 0.0 : num;
}

// three r186's WebGLRenderer requires WebGL2; detect its absence so the app can
// show a message instead of throwing on renderer construction.
function hasWebGL2(createCanvas = () => document.createElement('canvas')){
    try {
        return !!createCanvas().getContext('webgl2');
    } catch {
        return false;
    }
}

// Source capability probes. Both answer false rather than throw when the API
// is missing (older browsers, non-secure contexts, non-browser tests).
function hasMicrophone(){
    try {
        return typeof navigator !== 'undefined'
            && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    } catch {
        return false;
    }
}

// Only Chromium engines actually capture audio with getDisplayMedia; Firefox and
// Safari expose the API but ignore audio, so offering it there only fails.
function isChromium(){
    return /Chrome|Chromium|Edg\//i.test(navigator.userAgent || '');
}

// Tab audio is desktop Chromium only: phones have no tabs to share, and
// non-Chromium engines return a stream with no audio track.
function hasTabAudioCapture(){
    try {
        return typeof navigator !== 'undefined'
            && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
            && isChromium()
            && !isMobile();
    } catch {
        return false;
    }
}

export { isMobile, isIOS, clamp, checkIsNan, hasWebGL2, hasMicrophone, hasTabAudioCapture };