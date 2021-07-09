/*
    Utils.js - utility functions

    Copyright © 2021 Anthony Stellato
*/

function isMobile(){
    return /(iPad|iPhone|iPod|Android|webOS|BlackBerry|Windows Phone)/g.test( navigator.userAgent );
}

function isIOS(){
    return /(iPad|iPhone|iPod)/g.test( navigator.userAgent );
}

const clamp = (num, min, max) => {
    return Math.min(Math.max(num, min), max);
}

const checkIsNan = (num) => {
    return (Number.isNaN(num)) ? 0.0 : num;
}

export { isMobile, isIOS, clamp, checkIsNan };