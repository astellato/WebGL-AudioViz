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

export { isMobile, isIOS, clamp, checkIsNan, hasWebGL2 };