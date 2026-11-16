/*
    run.mjs - offline test harness for the audio analysis and beat detection

    Replays audio through the real AudioAnalyzer (scripts/audio) in Node, with a
    simulated AnalyserNode and a jittered frame clock, and reports how it did.

        npm run audio:test                          synthetic tracks + the default track
        npm run audio:test -- --track song.mp3      report on another file (needs ffmpeg)
        npm run audio:test -- --track song.mp3 --bpm 128
        npm run audio:test -- --fps 60,120          frame rates to simulate
        npm run audio:test -- --no-track            synthetic tracks only (no ffmpeg needed)

    The synthetic tracks have known beat times, so they are checked against limits and
    the process exits with code 1 when one fails. A real track has no ground truth: its
    section is a report to read, not a pass/fail test.
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioAnalyzer } from '../../scripts/audio/AudioAnalyzer.js';
import { SAMPLE_RATE, decodeAudio, mockAudio, percentile } from './sim.mjs';
import { buildTracks } from './synth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_TRACK = path.join(ROOT, 'public/audio/1048360_Creo---Drift.mp3');
const FFT_SIZE = 2048;
const LEVELS = 6;

// limits for the synthetic tracks, at the frame rates in CHECKED_FPS
const CHECKED_FPS = [60, 144];      // 30 fps samples the spectrum too coarsely to hold these; it is reported only
const MIN_RECALL = 0.9;             // share of true kick/snare hits that must be detected
const TEMPO_TOLERANCE = 0.02;       // relative; half and double tempo count as correct
const MATCH_EARLY = 0.02;           // seconds a detection may precede the true hit
const MATCH_LATE = 0.09;            // seconds it may follow it
const GRID_TOLERANCE = 0.04;        // seconds a beat interval may be off the tempo grid
const SETTLE = 2;                   // seconds skipped at the start while the detector adapts

function parseArgs(argv){
    const args = { fps: [60, 144, 30], track: DEFAULT_TRACK, bpm: 0, useTrack: true };
    for(let i = 0; i < argv.length; i++){
        const arg = argv[i];
        if(arg === '--track'){ args.track = path.resolve(argv[++i]); args.trackGiven = true; }
        else if(arg === '--bpm') args.bpm = Number(argv[++i]);
        else if(arg === '--fps') args.fps = argv[++i].split(',').map(Number);
        else if(arg === '--no-track') args.useTrack = false;
        else if(arg === '--help' || arg === '-h') args.help = true;
        else throw new Error('unknown argument: ' + arg);
    }
    if(args.fps.some(f => !(f > 0)) || !(args.bpm >= 0)) throw new Error('--fps and --bpm need positive numbers');
    return args;
}

// run the analyzer over a whole track the way the render loop would: one update per
// frame, with frame times jittered by +-15% like a real requestAnimationFrame clock
function analyze(pcm, fps){
    const { analyser, audio } = mockAudio(pcm);
    const analyzer = new AudioAnalyzer(audio, false, LEVELS, FFT_SIZE);
    const duration = pcm.length / SAMPLE_RATE;
    const levels = Array.from({ length: LEVELS }, () => []);
    const total = [], beats = [], bpms = [];
    let t = 0, seed = 1, nextBpmSample = 8;

    for(;;){
        seed = (seed * 16807) % 2147483647;
        const dt = (0.85 + 0.3 * seed / 2147483647) / fps;
        t += dt;
        // stop at the end of the audio: a window running past it sees the sound cut off, which is not part of the track
        if(t >= duration) break;
        analyser.setTime(t);
        analyzer.update(dt);

        for(let i = 0; i < LEVELS; i++) levels[i].push(analyzer.getAverage(i));
        total.push(analyzer.getRelativeTotal());
        if(analyzer.isOnBeat()) beats.push(t);
        if(t >= nextBpmSample){     // once a second, after the tempo window has filled
            nextBpmSample += 1;
            bpms.push(analyzer.getBpm());
        }
    }
    return { analyzer, duration, levels, total, beats, bpms };
}

const tempoMatches = (bpm, truth) => [0.5, 1, 2].some(m => Math.abs(bpm - truth * m) <= truth * m * TEMPO_TOLERANCE);

// share of gaps between consecutive beats that are a whole number of grid steps long.
// Gaps are short, so unlike a grid laid over the whole track this does not need the
// tempo to be known to a fraction of a percent.
function gridFit(beats, step, tolerance = GRID_TOLERANCE){
    let hits = 0;
    for(let i = 1; i < beats.length; i++){
        const steps = (beats[i] - beats[i - 1]) / step;
        if(Math.abs(steps - Math.round(steps)) * step < tolerance) hits++;
    }
    return beats.length > 1 ? hits / (beats.length - 1) : 0;
}

const percent = v => Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '-';

function table(header, rows){
    const widths = header.map((h, c) => Math.max(h.length, ...rows.map(r => String(r[c]).length)));
    const line = cells => cells.map((cell, c) => String(cell).padEnd(widths[c])).join('  ').trimEnd();
    console.log(line(header));
    console.log(widths.map(w => '-'.repeat(w)).join('  '));
    for(const row of rows) console.log(line(row));
}

function testSynthetic(fpsList){
    console.log('\n== Synthetic tracks (known beat times) ==\n');
    const rows = [], failures = [];

    for(const track of buildTracks()){
        for(const fps of fpsList){
            const { beats, bpms } = analyze(track.pcm, fps);
            const truth = track.truth.filter(t => t > SETTLE);
            const found = beats.filter(t => t > SETTLE);
            const isMatch = (beat, hit) => beat - hit > -MATCH_EARLY && beat - hit < MATCH_LATE;

            const delays = [];
            for(const hit of truth){
                const beat = found.find(b => isMatch(b, hit));
                if(beat !== undefined) delays.push(beat - hit);
            }
            const extra = found.filter(b => !truth.some(hit => isMatch(b, hit))).length;
            const recall = truth.length ? delays.length / truth.length : NaN;
            const bpm = percentile(bpms, 0.5);
            const tempoOk = track.bpm ? bpms.filter(b => tempoMatches(b, track.bpm)).length / bpms.length : NaN;

            const problems = [];
            if(CHECKED_FPS.includes(fps)){
                if(track.bpm){
                    if(recall < MIN_RECALL) problems.push(`recall ${percent(recall)} < ${percent(MIN_RECALL)}`);
                    if(tempoOk < 0.9) problems.push(`tempo right only ${percent(tempoOk)} of the time`);
                } else if(found.length > 0){
                    problems.push(`${found.length} beats in a track with none`);
                }
            }
            for(const p of problems) failures.push(`${track.name} @${fps}fps: ${p}`);

            rows.push([
                track.name, fps, percent(recall), `${extra} of ${found.length}`,
                delays.length ? (percentile(delays, 0.5) * 1000).toFixed(0) + ' ms' : '-',
                track.bpm ? `${bpm.toFixed(1)} (true ${track.bpm})` : '-',
                !CHECKED_FPS.includes(fps) ? 'not checked' : problems.length ? 'FAIL' : 'ok',
            ]);
        }
    }
    table(['track', 'fps', 'found', 'extra beats', 'delay', 'tempo', 'check'], rows);
    console.log(`\nfound: true hits detected.  extra beats: detections with no true hit nearby (hi-hats count as extra).`);
    return failures;
}

// digital silence reads as -Infinity dB: nothing may turn into NaN or fire
function testSilence(){
    const { analyzer, beats } = analyze(new Float32Array(SAMPLE_RATE * 3), 60);
    const beat = analyzer.getBeat();
    const values = [...analyzer.bands.levels, analyzer.getRelativeTotal(), beat.onBeat ? 1 : 0, beat.strength];
    const ok = beats.length === 0 && values.every(v => v === 0);
    console.log(`\n== Silence ==\n\nall outputs zero, no beats: ${ok ? 'ok' : 'FAIL'}`);
    return ok ? [] : ['silence: outputs were ' + values.join(', ') + `, beats ${beats.length}`];
}

function reportTrack(file, fpsList, knownBpm, required){
    console.log(`\n== ${path.basename(file)} ==\n`);
    let pcm;
    try {
        pcm = decodeAudio(file);
    } catch(error){
        // a track the user asked for must load; the bundled one is skipped when ffmpeg is missing
        if(required) throw error;
        console.log(`skipped: ${error.message}`);
        return;
    }

    const runs = fpsList.map(fps => ({ fps, ...analyze(pcm, fps) }));
    const first = runs[0];
    const edges = Array.from(first.analyzer.bands.bandFreqs, f => f.toFixed(0));

    console.log(`band levels at ${first.fps} fps (10th / 50th / 90th percentile, each 0 to 1):\n`);
    const levelRow = (name, values) => [name, ...[0.1, 0.5, 0.9].map(p => percentile(values, p).toFixed(2))];
    table(['band', 'p10', 'p50', 'p90'], [
        ...first.levels.map((values, i) => levelRow(`${i}  ${edges[i]} - ${edges[i + 1]} Hz`, values)),
        levelRow('total', first.total),
    ]);

    // Without a known tempo the grid comes from the detector's own estimate, so the grid
    // columns then show whether beats and tempo agree with each other, not whether both are right.
    const detected = percentile(first.bpms.filter(b => b > 0), 0.5);
    let bpm = knownBpm || detected;
    if(!(bpm > 0)){
        console.log('\nno tempo found, so no beat report.');
        return;
    }
    // the estimate may be half time; fold it up so the grid step stays a short subdivision
    if(!knownBpm) while(bpm < 100) bpm *= 2;
    console.log(knownBpm
        ? `\nbeats, against the given tempo of ${knownBpm} BPM:\n`
        : `\nbeats, against the detector's own median tempo (${detected.toFixed(1)} BPM, counted as ${bpm.toFixed(1)}; pass --bpm to use the real one):\n`);
    const quarter = 60 / bpm;
    table(['fps', 'beats/min', 'on 8th grid', 'on quarter grid', 'tempo median', knownBpm ? 'tempo right' : 'tempo stable', `also found at ${first.fps} fps`],
        runs.map(run => [
            run.fps,
            (run.beats.length / run.duration * 60).toFixed(0),
            percent(gridFit(run.beats, quarter / 2)),
            percent(gridFit(run.beats, quarter)),
            percentile(run.bpms.filter(b => b > 0), 0.5).toFixed(1),
            percent(run.bpms.filter(b => tempoMatches(b, bpm)).length / run.bpms.length),
            run === first ? '-' : percent(run.beats.filter(b => first.beats.some(x => Math.abs(x - b) < 0.05)).length / run.beats.length),
        ]));
    const chance = step => percent(Math.min(1, 2 * GRID_TOLERANCE / step));
    console.log(`\ngrid columns: share of gaps between beats that are a whole number of 8th / quarter notes, within ${GRID_TOLERANCE * 1000} ms.`);
    console.log(`Randomly timed beats would score about ${chance(quarter / 2)} and ${chance(quarter)}.`);
}

// time the analyzer's own JavaScript with a canned spectrum, i.e. without the FFT the browser does natively
function reportTiming(){
    const db = Float32Array.from({ length: FFT_SIZE / 2 }, (_, i) => -30 - 40 * ((i * 7919) % 100) / 100 - i * 0.03);
    const analyser = {
        fftSize: FFT_SIZE, frequencyBinCount: FFT_SIZE / 2,
        getFloatFrequencyData(out){ out.set(db); },
        getByteTimeDomainData(out){ out.fill(128); },
        getFloatTimeDomainData(out){ out.fill(0); },
    };
    const audio = { context: { sampleRate: SAMPLE_RATE, createAnalyser: () => analyser }, connect(){}, getOutput: () => ({ connect(){} }) };
    const analyzer = new AudioAnalyzer(audio, false, LEVELS, FFT_SIZE);
    // vary the spectrum a little so the tempo estimate has something to correlate
    const step = () => { db[5] = -30 - 30 * Math.random(); analyzer.update(1 / 60); };

    for(let i = 0; i < 20000; i++) step();
    const frames = 100000;
    let start = performance.now();
    for(let i = 0; i < frames; i++) step();
    const perFrame = (performance.now() - start) / frames;

    start = performance.now();
    for(let i = 0; i < 200; i++) analyzer.beatDetector.estimateTempo();
    const tempo = (performance.now() - start) / 200;

    console.log(`\n== Timing (analyzer JavaScript only, this machine) ==\n`);
    console.log(`per frame, tempo estimate included: ${(perFrame * 1000).toFixed(1)} µs  (a 60 fps frame is 16667 µs)`);
    console.log(`tempo estimate alone, runs once a second: ${tempo.toFixed(2)} ms`);
}

function main(){
    const args = parseArgs(process.argv.slice(2));
    if(args.help){
        console.log('usage: node tools/audioharness/run.mjs [--track file] [--bpm n] [--fps 60,144,30] [--no-track]');
        return;
    }

    const failures = [...testSynthetic(args.fps), ...testSilence()];
    if(args.useTrack) reportTrack(args.track, args.fps, args.bpm, args.trackGiven);
    reportTiming();

    if(failures.length){
        console.log(`\nFAILED (${failures.length}):`);
        for(const f of failures) console.log('  ' + f);
        process.exitCode = 1;
    } else {
        console.log('\nAll checks passed.');
    }
}

try {
    main();
} catch(error){
    console.error(error.message);
    process.exitCode = 2;
}
