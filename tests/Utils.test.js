import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasWebGL2, hasMicrophone, hasTabAudioCapture } from '../scripts/Utils.js';

afterEach(() => vi.unstubAllGlobals());

it('is false when WebGL2 is unavailable', () => {
  expect(hasWebGL2(() => ({ getContext: () => null }))).toBe(false);
});

it('is true when a WebGL2 context is available', () => {
  expect(hasWebGL2(() => ({ getContext: () => ({}) }))).toBe(true);
});

it('detects microphone and tab-audio capture', () => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, userAgent: 'Mozilla/5.0 (X11; Linux)' });
  expect(hasMicrophone()).toBe(true);
  expect(hasTabAudioCapture()).toBe(true);

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {} }, userAgent: 'Mozilla/5.0 (X11; Linux)' });
  expect(hasTabAudioCapture()).toBe(false);

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, userAgent: 'Mozilla/5.0 (iPhone)' });
  expect(hasTabAudioCapture()).toBe(false); // desktop-only

  vi.stubGlobal('navigator', { userAgent: 'x' });
  expect(hasMicrophone()).toBe(false);
  expect(hasTabAudioCapture()).toBe(false);
});
