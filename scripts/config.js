/*
    config.js - tuning constants for the AudioSphere visualizer

    Everything here is read-only after import. Mutable per-frame state
    (uniform values, scene handles, timing) lives on AudioSphereApp.
*/

import { Vector3 } from 'three';

// FFT 2048 gives ~23 Hz bins at 48 kHz. The log spaced bands and the beat
// detector both work below ~100 Hz, which 512 (94 Hz bins) cannot resolve: at
// 512 the lowest bands collapse onto one bin and beat recall drops sharply.
export const FFT_SIZE = 2048;
export const AUDIO_LEVELS = 6;

// Crossfade when switching audio source (seconds). Long enough to hear the
// default track fade out, short enough not to feel sluggish.
export const AUDIO_FADE_SECONDS = 0.4;

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

// Onset detail. The flux is measured in dB per log spaced sub band, so a rise is
// the same number of dB however loud the input is (a track 30 dB down detects the
// same beats).
export const BEAT_MIN_INTERVAL_SECONDS = 0.15;  // 400 beats per minute ceiling
export const BEAT_FLUX_LAG_SECONDS = 0.07;     // how far back the rise is measured from
export const BEAT_STATS_SECONDS = 1.5;         // adaptive threshold memory
export const BEAT_RISE_CAP_DB = 18;            // most one sub band may contribute
export const BEAT_MIN_FLUX_DB = 2;             // dB of rise always required, so steady sound never fires

// Beat debug pane: the top of its scrolling flux plot, in dB. The detector's
// flux is a mean of per sub band dB rises (the weights sum to 1) with each rise
// capped at BEAT_RISE_CAP_DB, so 18 dB is its hard maximum: a full broadband
// onset measures exactly that, a kick about 15, and a kick over a bass line
// about 14. The pane tops out at 16 so ordinary onsets stay near full height
// while the loudest frames clamp instead of drawing past the pane.
export const BEAT_FLUX_DISPLAY_MAX = 16;

// Tempo estimation: the flux envelope is resampled to TEMPO_RATE Hz over a
// TEMPO_SECONDS window and autocorrelated with a comb over the BPM range.
export const TEMPO_RATE = 100;
export const TEMPO_SECONDS = 8;
export const TEMPO_MIN_BPM = 60;
export const TEMPO_MAX_BPM = 200;
export const TEMPO_COMB_TEETH = 4;
export const TEMPO_INTERVAL_SECONDS = 1;

// Extra blob displacement added on a beat (Phase 1 pill)
export const BEAT_PULSE = 0.15;

// Control state / drift
export const STORAGE_KEY = 'audioviz.control.v1';
// The chosen audio source lives under its own key: the bootstrap reads it before
// the app exists, to decide between the start overlay and a straight-in reload.
export const AUDIO_STORAGE_KEY = 'audioviz.audio.v1';
export const DRIFT_DEFAULT_SPEED_SECONDS = 60;
export const DRIFT_SPEED_OPTIONS = [30, 60, 120];
export const DRIFT_SCOPES = ['visualizers', 'variants', 'both'];

// Mobile swipe
export const SWIPE_THRESHOLD_PX = 40;

// Name flash
export const NAME_FLASH_MS = 1600;
