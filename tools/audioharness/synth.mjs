/*
    synth.mjs - synthetic test tracks with known beat times

    Each track returns { name, bpm, pcm, truth } where truth lists the times (seconds)
    of the kick and snare hits a beat detector should find. Deterministic: the noise
    comes from a seeded generator, so results are the same on every run.
*/

import { SAMPLE_RATE as SR } from './sim.mjs';

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function kick(buf, t, gain = 0.9){
    const start = Math.floor(t * SR);
    let phase = 0;
    for(let i = 0; i < SR * 0.25 && start + i < buf.length; i++){
        const x = i / SR;
        phase += 2 * Math.PI * (45 + 110 * Math.exp(-x * 30)) / SR;    // pitch drops from 155 to 45 Hz
        buf[start + i] += gain * Math.sin(phase) * Math.exp(-x * 14);
    }
}

function snare(buf, t, gain = 0.5){
    const start = Math.floor(t * SR);
    for(let i = 0; i < SR * 0.18 && start + i < buf.length; i++){
        const x = i / SR;
        buf[start + i] += gain * ((random() * 2 - 1) * Math.exp(-x * 22) + 0.5 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x * 30));
    }
}

function hat(buf, t, gain = 0.12){
    const start = Math.floor(t * SR);
    let previous = 0;
    for(let i = 0; i < SR * 0.04 && start + i < buf.length; i++){
        const noise = random() * 2 - 1;
        buf[start + i] += gain * (noise - previous) * Math.exp(-i / SR * 90);   // differenced = high passed
        previous = noise;
    }
}

// slowly moving chord: sustained energy with no onsets
function pad(buf, gain = 0.12){
    const freqs = [110, 164.8, 220, 277.2, 329.6, 440];
    for(let i = 0; i < buf.length; i++){
        const t = i / SR;
        let v = 0;
        for(const f of freqs) v += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.7) * 2);
        buf[i] += gain * v / freqs.length * (0.8 + 0.2 * Math.sin(t * 0.5));
    }
}

// 8th note bass line: low energy the kick has to stand out from
function bass(buf, bpm, gain = 0.3){
    const eighth = 30 / bpm;
    const notes = [55, 55, 65.4, 49];
    for(let i = 0; i < buf.length; i++){
        const t = i / SR;
        const n = Math.floor(t / eighth);
        const x = t - n * eighth;
        buf[i] += gain * Math.tanh(2 * Math.sin(2 * Math.PI * notes[Math.floor(n / 8) % 4] * t)) * Math.min(1, x * 200) * Math.exp(-x * 3);
    }
}

function make(name, bpm, seconds, build){
    const pcm = new Float32Array(SR * seconds);
    const truth = [];
    build(pcm, 60 / bpm, truth, seconds);
    for(let i = 0; i < pcm.length; i++){
        pcm[i] = Math.tanh(pcm[i] + (random() * 2 - 1) * 0.003);   // soft clip plus a noise floor
    }
    return { name, bpm, pcm, truth };
}

// kick 1, snare 2, kick 3.5, snare 4, hats on 8ths
function breakbeat(buf, q, truth, seconds, gain){
    for(let bar = 0; bar * 4 * q < seconds; bar++){
        const t0 = bar * 4 * q;
        for(const [beat, drum] of [[0, kick], [1, snare], [2.5, kick], [3, snare]]){
            drum(buf, t0 + beat * q, gain);
            truth.push(t0 + beat * q);
        }
        for(let e = 0; e < 8; e++) hat(buf, t0 + e * q / 2);
    }
}

export function buildTracks(seconds = 40){
    seed = 7;
    return [
        // four on the floor, off-beat hats, snare layered on 2 and 4
        make('house 124', 124, seconds, (b, q, truth, dur) => {
            pad(b); bass(b, 124);
            for(let t = 0; t < dur; t += q){
                kick(b, t); truth.push(t);
                hat(b, t + q / 2, 0.2);
                if(Math.round(t / q) % 2) snare(b, t, 0.3);
            }
        }),
        make('hip-hop 92', 92, seconds, (b, q, truth, dur) => { pad(b, 0.08); breakbeat(b, q, truth, dur); }),
        make('drum and bass 172', 172, seconds, (b, q, truth, dur) => { bass(b, 172, 0.35); breakbeat(b, q, truth, dur, 0.8); }),
        // same groove 30 dB down: the result must not depend on input gain
        make('house 124 at -30 dB', 124, seconds, (b, q, truth, dur) => {
            pad(b); bass(b, 124);
            for(let t = 0; t < dur; t += q){ kick(b, t); truth.push(t); hat(b, t + q / 2, 0.2); }
            for(let i = 0; i < b.length; i++) b[i] *= 0.03;
        }),
        // no drums at all: anything detected after the start is a false beat
        make('pad only (no beat)', 0, seconds, (b) => { pad(b, 0.3); }),
    ];
}
