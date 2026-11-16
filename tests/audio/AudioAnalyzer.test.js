import { describe, it, expect } from 'vitest';
import { AudioAnalyzer } from '../../scripts/audio/AudioAnalyzer.js';

function fakeNode(spectrum) {
  const analyser = {
    fftSize: 512,
    smoothingTimeConstant: 0.3,
    frequencyBinCount: 256,
    getByteFrequencyData(arr) { arr.set(spectrum.slice(0, arr.length)); },
    getByteTimeDomainData(arr) { arr.fill(128); },
  };
  return { context: { createAnalyser: () => analyser }, connect() {}, _spectrum: spectrum };
}

it('exposes a normalized spectrum and a beat packet', () => {
  const spectrum = new Uint8Array(256);
  const node = fakeNode(spectrum);
  const a = new AudioAnalyzer(node, false, 6, 512);
  a.update(1 / 60);
  expect(a.getSpectrum()).toBeInstanceOf(Float32Array);
  expect(a.getSpectrum()[12]).toBe(0);
  expect(a.getBeat().onBeat).toBe(false);

  for (let i = 0; i < 5; i++) a.update(1 / 60); // warm up on silence
  for (let i = 10; i < 20; i++) spectrum[i] = 255; // broadband onset (single bin is below the noise floor at 256 bins)
  a.update(1 / 60);
  expect(a.getSpectrum()[12]).toBeCloseTo(1, 5);
  expect(a.getBeat().onBeat).toBe(true);
});

// Float path: the analyzer prefers getFloatFrequencyData when the node provides it,
// which avoids the byte scale's 8-bit quantization and -30 dB clipping.
function floatNode(dbSpectrum, sampleRate = 48000) {
  const analyser = {
    fftSize: 512,
    smoothingTimeConstant: 0,
    frequencyBinCount: dbSpectrum.length,
    getFloatFrequencyData(arr) { arr.set(dbSpectrum.subarray(0, arr.length)); },
    getByteTimeDomainData(arr) { arr.fill(128); },
  };
  return { context: { sampleRate, createAnalyser: () => analyser }, connect() {} };
}

describe('AudioAnalyzer (float dB input)', () => {
  it('reads float dB, exposes bands and keeps a finite spectrum', () => {
    const db = new Float32Array(256).fill(-Infinity); // digital silence
    const a = new AudioAnalyzer(floatNode(db), false, 6, 512);
    for (let i = 0; i < 4; i++) a.update(1 / 60);

    expect(a.getSpectrum()).toBeInstanceOf(Float32Array);
    expect(a.getSpectrum().every(Number.isFinite)).toBe(true);
    expect(a.getRelativeTotal()).toBeGreaterThanOrEqual(0);
    for (let band = 0; band < 6; band++) {
      expect(Number.isFinite(a.getAverage(band))).toBe(true);
      expect(a.getAverage(band)).toBeGreaterThanOrEqual(0);
    }

    // a loud low end must not saturate: float data carries detail above -30 dB
    for (let i = 1; i < 40; i++) db[i] = -6;
    for (let i = 0; i < 4; i++) a.update(1 / 60);
    expect(a.getSpectrum()[4]).toBeGreaterThan(0.5);
    expect(a.getSpectrum()[4]).toBeLessThanOrEqual(1);
  });

  it('reports an increasingly confident tempo on a steady pulse', () => {
    const db = new Float32Array(256).fill(-100);
    const a = new AudioAnalyzer(floatNode(db), false, 6, 512);
    const dt = 1 / 60;
    let t = 0;
    // 120 BPM: a kick every 0.5 s, wide enough to read as broadband energy
    for (let frame = 0; frame < 60 * 12; frame++) {
      const phase = t % 0.5;
      const hit = phase < dt * 1.5;
      for (let i = 1; i < 40; i++) db[i] = hit ? -8 : -96;
      a.update(dt);
      t += dt;
    }
    expect(a.getBpm()).toBeGreaterThan(100);
    expect(a.getBpm()).toBeLessThan(140);
  });
});
