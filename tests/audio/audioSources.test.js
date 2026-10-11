import { describe, it, expect } from 'vitest';
import { AUDIOINPUTS, CHOOSABLE_SOURCES, AUDIO_SOURCE_LABELS, resolveAudioSource } from '../../scripts/audio/audioSources.js';

it('exposes the four inputs and the three choosable ones', () => {
  expect(AUDIOINPUTS).toEqual({ NONE: 0, DEFAULT: 1, MIC: 2, TAB: 3, DROPMP3: 4 });
  expect(CHOOSABLE_SOURCES).toEqual([1, 2, 3]);
  expect(AUDIO_SOURCE_LABELS[2]).toBe('Microphone');
});

it('keeps a supported remembered source', () => {
  expect(resolveAudioSource(AUDIOINPUTS.DEFAULT, { canMic: true, canTab: true })).toBe(1);
  expect(resolveAudioSource(AUDIOINPUTS.MIC, { canMic: true })).toBe(2);
  expect(resolveAudioSource(AUDIOINPUTS.TAB, { canTab: true })).toBe(3);
});

it('falls back to Default music when the remembered source is unsupported', () => {
  expect(resolveAudioSource(AUDIOINPUTS.TAB, { canTab: false })).toBe(1);
  expect(resolveAudioSource(AUDIOINPUTS.MIC, { canMic: false })).toBe(1);
});

it('returns null when nothing is remembered, so the overlay shows', () => {
  expect(resolveAudioSource(null, { canMic: true, canTab: true })).toBeNull();
  expect(resolveAudioSource(99, {})).toBeNull();
});
