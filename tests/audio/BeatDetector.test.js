import { describe, it, expect } from 'vitest';
import { BeatDetector } from '../../scripts/audio/BeatDetector.js';

const N = 8;
const opts = { windowSeconds: 1.0, margin: 1.6, floor: 0.02, refractorySeconds: 0.12, levelsCount: 6 };
const quiet = () => new Float32Array(N);
const spike = (bin, mag = 1.0) => { const a = new Float32Array(N); a[bin] = mag; return a; };

describe('BeatDetector', () => {
  it('never fires on a constant spectrum', () => {
    const d = new BeatDetector(opts);
    const s = new Float32Array(N).fill(0.5);
    let fired = false;
    for (let i = 0; i < 20; i++) fired ||= d.update(s, 1 / 60).onBeat;
    expect(fired).toBe(false);
  });

  it('fires on a sharp rise after warm-up and reports location/band', () => {
    const d = new BeatDetector(opts);
    for (let i = 0; i < 5; i++) d.update(quiet(), 1 / 60);
    const p = d.update(spike(6), 1 / 60);
    expect(p.onBeat).toBe(true);
    expect(p.strength).toBeGreaterThan(0);
    expect(p.location).toBeCloseTo(6 / (N - 1), 2);
    expect(p.band).toBe(5);
  });

  it('suppresses a repeat inside the refractory window, then allows it after', () => {
    const d = new BeatDetector(opts);
    for (let i = 0; i < 5; i++) d.update(quiet(), 1 / 60);
    expect(d.update(spike(2), 1 / 60).onBeat).toBe(true);
    expect(d.update(quiet(), 0.05).onBeat).toBe(false);
    for (let i = 0; i < 4; i++) d.update(quiet(), 0.05);
    expect(d.update(spike(2), 1 / 60).onBeat).toBe(true);
  });

  it('returns finite values when a bin is NaN', () => {
    const d = new BeatDetector(opts);
    const bad = new Float32Array(N);
    bad[3] = NaN;
    const p = d.update(bad, 1 / 60);
    expect(Number.isNaN(p.strength)).toBe(false);
    expect(Number.isNaN(p.location)).toBe(false);
    expect(Number.isNaN(p.band)).toBe(false);
  });
});
