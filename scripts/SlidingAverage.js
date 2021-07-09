/*
    SlidingAverage.js - class for computing sliding averages

    Copyright © 2021 Anthony Stellato
*/

class SlidingAverage {
    
    constructor(_windowSize, _initialValue){
        this.windowSize = _windowSize;
        this.buffer = new Float32Array(_windowSize);
        this.sum = 0;
        this.lastIndex = 0;
        this.value = 0;
        this.reset(_initialValue);
    }

    reset(val){
        this.sum = val * this.buffer.length;
        for(let i = 0; i < this.windowSize; i++){
            this.buffer[i] = val;
        }
        this.value = this.sum/this.windowSize;
    }

    push(val){
        if(!Number.isNaN(val)){
            this.sum -= this.buffer[this.lastIndex];
            this.sum += val;
            this.buffer[this.lastIndex] = val;

            this.lastIndex += 1;
            if(this.lastIndex >= this.buffer.length){
                this.lastIndex = 0;
            }

            this.value = this.sum/this.windowSize;
        }
    }

    getAverage(){
        return this.value;
    }
}

export { SlidingAverage };