/*
    DriftController.js - decides *when* a drift step is due.

    It owns only a timer. ControlState owns what a step does (which scene or
    variant), so the drift logic stays a pure function of elapsed time and the
    pause conditions. The timer freezes (does not reset) while audio is paused
    or the tab is hidden.

    Copyright © 2021 Anthony Stellato
*/

class DriftController {

    constructor(speedSeconds = 60) {
        this.speedSeconds = speedSeconds;
        this.accumulator = 0;
    }

    setSpeed(seconds) {
        this.speedSeconds = seconds;
    }

    reset() {
        this.accumulator = 0;
    }

    /**
     * @param {number} deltaTime seconds
     * @param {{enabled: boolean, audioPaused: boolean, hidden: boolean}} ctx
     * @returns {boolean} true on the frame a drift step is due
     */
    tick(deltaTime, { enabled, audioPaused, hidden } = {}) {
        if (!enabled || audioPaused || hidden) return false;
        this.accumulator += deltaTime;
        if (this.accumulator >= this.speedSeconds) {
            this.accumulator = 0;
            return true;
        }
        return false;
    }
}

export { DriftController };
