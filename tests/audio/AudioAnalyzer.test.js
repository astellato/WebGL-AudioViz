import { describe, it, expect } from 'vitest';
import { AudioAnalyzer } from '../../scripts/audio/AudioAnalyzer.js';

function fakeAudio(spectrum) {
  const analyser = {
    fftSize: 512,
    smoothingTimeConstant: 0.3,
    frequencyBinCount: 256,
    getByteFrequencyData(arr) { arr.set(spectrum.slice(0, arr.length)); },
    getByteTimeDomainData(arr) { arr.fill(128); },
  };
  return { context: { createAnalyser: () => analyser }, getOutput: () => ({ connect() {} }), _spectrum: spectrum };
}

it('exposes a normalized spectrum and a beat packet', () => {
  const spectrum = new Uint8Array(256);
  const audio = fakeAudio(spectrum);
  const a = new AudioAnalyzer(audio, false, 6, 512);
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
