import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasWebGL2, hasMicrophone, hasTabAudioCapture } from '../scripts/Utils.js';

afterEach(() => vi.unstubAllGlobals());

it('is false when WebGL2 is unavailable', () => {
  expect(hasWebGL2(() => ({ getContext: () => null }))).toBe(false);
});

it('is true when a WebGL2 context is available', () => {
  expect(hasWebGL2(() => ({ getContext: () => ({}) }))).toBe(true);
});

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

it('detects microphone and tab-audio capture', () => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, userAgent: CHROME_UA });
  expect(hasMicrophone()).toBe(true);
  expect(hasTabAudioCapture()).toBe(true);

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {} }, userAgent: CHROME_UA });
  expect(hasTabAudioCapture()).toBe(false);

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, userAgent: 'Mozilla/5.0 (iPhone)' });
  expect(hasTabAudioCapture()).toBe(false); // desktop-only

  // Firefox (and Safari) expose getDisplayMedia but ignore audio capture, so
  // tab audio must not be offered there.
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, userAgent: FIREFOX_UA });
  expect(hasTabAudioCapture()).toBe(false);

  vi.stubGlobal('navigator', { userAgent: 'x' });
  expect(hasMicrophone()).toBe(false);
  expect(hasTabAudioCapture()).toBe(false);
});
