// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { contexts } from './threeFakes.js';
import { AudioHandler, AUDIOINPUTS } from '../../scripts/audio/AudioHandler.js';
import { AUDIO_FADE_SECONDS } from '../../scripts/config.js';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  const fakes = await import('./threeFakes.js');
  return { ...actual, AudioListener: fakes.AudioListener, Audio: fakes.Audio, AudioLoader: fakes.AudioLoader };
});

function makeStream(track = { stop: vi.fn(), onended: null }) {
  return {
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track],
    _track: track,
  };
}

beforeEach(() => {
  contexts.length = 0;
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (X11; Linux)',
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(makeStream()),
      getDisplayMedia: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('builds a bus that is never wired to a destination', async () => {
  const h = new AudioHandler();
  const res = await h.setSource(AUDIOINPUTS.DEFAULT);
  expect(res.ok).toBe(true);
  expect(h.getSource()).toBe(AUDIOINPUTS.DEFAULT);
  expect(h.getOutput()).toBe(h.bus);

  const ctx = contexts[0];
  expect(ctx._connections.some(([src, dst]) => src === h.bus && dst === h.listener.gain)).toBe(false);
});

it('switching to mic detaches the default track and feeds the mic into the bus', async () => {
  vi.useFakeTimers();
  const h = new AudioHandler();
  await h.setSource(AUDIOINPUTS.DEFAULT);
  expect(h.audio.isPlaying).toBe(true);

  const res = await h.setSource(AUDIOINPUTS.MIC);
  expect(res.ok).toBe(true);
  expect(h.getSource()).toBe(AUDIOINPUTS.MIC);

  const ctx = contexts[0];
  expect(ctx._connections.some(([, dst]) => dst === h.bus)).toBe(true);

  vi.advanceTimersByTime(AUDIO_FADE_SECONDS * 1000);
  expect(h.audio.isPlaying).toBe(false);
});

it('keeps the current source when the mic prompt is denied', async () => {
  const h = new AudioHandler();
  await h.setSource(AUDIOINPUTS.DEFAULT);
  navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('denied'));

  const res = await h.setSource(AUDIOINPUTS.MIC);
  expect(res.ok).toBe(false);
  expect(h.getSource()).toBe(AUDIOINPUTS.DEFAULT);
  expect(h.audio.isPlaying).toBe(true);
});

it('discards a capture that resolves after a newer switch', async () => {
  const h = new AudioHandler();
  let resolveMic;
  navigator.mediaDevices.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveMic = resolve; }));

  const pending = h.setSource(AUDIOINPUTS.MIC);
  const newer = await h.setSource(AUDIOINPUTS.DEFAULT);
  expect(newer.ok).toBe(true);

  const stream = makeStream();
  resolveMic(stream);
  const stale = await pending;

  expect(stale.ok).toBe(false);
  expect(stream._track.stop).toHaveBeenCalled();
  expect(h.getSource()).toBe(AUDIOINPUTS.DEFAULT);
});

it('loads the default track lazily when selected after starting elsewhere', async () => {
  vi.useFakeTimers();
  const h = new AudioHandler();
  await h.setSource(AUDIOINPUTS.MIC);
  expect(h.audio.hasBuffer).toBeFalsy();

  const res = await h.setSource(AUDIOINPUTS.DEFAULT);
  expect(res.ok).toBe(true);
  expect(h.audio.hasBuffer).toBe(true);
  expect(h.audio.isPlaying).toBe(true);

  vi.advanceTimersByTime(AUDIO_FADE_SECONDS * 1000);
});

it('treats a display stream with no audio track as a failure', async () => {
  const h = new AudioHandler();
  await h.setSource(AUDIOINPUTS.DEFAULT);
  const video = { stop: vi.fn() };
  const stream = { getAudioTracks: () => [], getVideoTracks: () => [video], getTracks: () => [video] };
  navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(stream);

  const res = await h.setSource(AUDIOINPUTS.TAB);
  expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
  expect(video.stop).toHaveBeenCalled();
  expect(res.ok).toBe(false);
  expect(h.getSource()).toBe(AUDIOINPUTS.DEFAULT);
});

it('stops every track and clears the source when the user ends sharing', async () => {
  const h = new AudioHandler();
  const track = { stop: vi.fn(), onended: null };
  const stream = { getAudioTracks: () => [track], getVideoTracks: () => [], getTracks: () => [track] };
  navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(stream);

  await h.setSource(AUDIOINPUTS.TAB);
  expect(h.getSource()).toBe(AUDIOINPUTS.TAB);

  const ended = vi.fn();
  h.onSourceEnded = ended;
  track.onended(); // simulate the browser's own "Stop sharing"

  expect(h.getSource()).toBe(AUDIOINPUTS.NONE);
  expect(ended).toHaveBeenCalledTimes(1);
});

it('does not fire onSourceEnded when we stop sharing ourselves', async () => {
  vi.useFakeTimers();
  const h = new AudioHandler();
  const track = { stop: vi.fn(), onended: null };
  const stream = { getAudioTracks: () => [track], getVideoTracks: () => [], getTracks: () => [track] };
  navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(stream);
  await h.setSource(AUDIOINPUTS.TAB);
  expect(h.getSource()).toBe(AUDIOINPUTS.TAB);

  const ended = vi.fn();
  h.onSourceEnded = ended;
  await h.setSource(AUDIOINPUTS.DEFAULT);
  vi.advanceTimersByTime(AUDIO_FADE_SECONDS * 1000);

  expect(ended).not.toHaveBeenCalled();
  expect(track.onended).toBeNull();
});

it('keeps the default track playing when it is re-selected within the fade', async () => {
  vi.useFakeTimers();
  const h = new AudioHandler();
  await h.setSource(AUDIOINPUTS.DEFAULT);
  expect(h.audio.isPlaying).toBe(true);

  await h.setSource(AUDIOINPUTS.MIC);
  vi.advanceTimersByTime(AUDIO_FADE_SECONDS * 1000 / 2);
  await h.setSource(AUDIOINPUTS.DEFAULT);
  vi.advanceTimersByTime(AUDIO_FADE_SECONDS * 1000);

  expect(h.audio.isPlaying).toBe(true);
});
