/*
    config.js - tuning constants for the AudioSphere visualizer

    Everything here is read-only after import. Mutable per-frame state
    (uniform values, scene handles, timing) lives on AudioSphereApp.
*/

import { Vector3 } from 'three';

export const FFT_SIZE = 512;
export const AUDIO_LEVELS = 6;

export const SPHERE_RADIUS = 0.25;
export const SPHERE_RESOLUTION = 128;

// Sphere radial displacement, pushed to the GPU via the uDisplace uniform
export const DISPLACE_STRENGTH = 20;

// Clamp frame gaps (tab refocus, GC stalls) to keep motion stable
export const MAX_DELTA_TIME = 0.05;

// Cap render resolution on high-DPI screens (mobile GPUs get the lower cap)
export const MAX_PIXEL_RATIO_DESKTOP = 2;
export const MAX_PIXEL_RATIO_MOBILE = 1.5;

export const NOISE_MAX = 1.0;

export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const CAMERA_Z = 3;

// Blob shader color-palette base values. AudioSphereApp copies these into
// mutable state at startup and modulates them from the audio analyzer.
export const BRIGHTNESS_MIN = new Vector3(0.5, 0.5, 0.4);
export const CONTRAST_MIN = new Vector3(0.2, 0.4, 0.2);
export const OSCILATION_MIN = new Vector3(1.0, 0.7, 0);
export const PHASE_MIN = new Vector3(0, 0.10, 0.20);

export const BRIGHTNESS_MULT = new Vector3(0.3, 0.1, 0.1);
export const CONTRAST_MULT = new Vector3(0.3, 0.3, 0.3);
export const OSCILATION_MULT = new Vector3(1, 0.2, 1);
export const PHASE_MULT = new Vector3(0.4, 0.4, 0.4);

// Beat detection (spectral flux + adaptive threshold). Starting values;
// tuned by ear against real tracks.
export const BEAT_WINDOW_SECONDS = 1.0;
export const BEAT_MARGIN = 1.6;
export const BEAT_FLUX_FLOOR = 0.02;
export const BEAT_REFRACTORY_SECONDS = 0.12;

// Extra blob displacement added on a beat (Phase 1 pill)
export const BEAT_PULSE = 0.15;

// Control state / drift
export const STORAGE_KEY = 'audioviz.control.v1';
export const DRIFT_DEFAULT_SPEED_SECONDS = 60;
export const DRIFT_SPEED_OPTIONS = [30, 60, 120];
export const DRIFT_SCOPES = ['visualizers', 'variants', 'both'];

// Mobile swipe
export const SWIPE_THRESHOLD_PX = 40;
