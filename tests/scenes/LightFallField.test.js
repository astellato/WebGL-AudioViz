import { describe, it, expect } from 'vitest';
import { createTrailField, canyonPoint } from '../../scripts/scenes/LightFallField.js';

describe('createTrailField', () => {
  it('lays out one near point per trail plus a shared apex', () => {
    const field = createTrailField({ trailCount: 12, segments: 8 });
    expect(field.trailCount).toBe(12);
    expect(field.near).toHaveLength(12 * 3);
    expect(field.phase).toHaveLength(12);
    expect(field.spectral).toHaveLength(12);
    expect(Number.isFinite(field.apex.x)).toBe(true);
  });

  it('gives every trail a spectral position in [0,1]', () => {
    const field = createTrailField({ trailCount: 20 });
    for (const q of field.spectral) {
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });
});

describe('canyonPoint', () => {
  it('returns the near point at s=0 and the apex at s=1', () => {
    const field = createTrailField({ trailCount: 6 });
    const out = { x: 0, y: 0, z: 0 };
    canyonPoint(field, 3, 0, out);
    expect(out.x).toBeCloseTo(field.near[3 * 3], 5);
    expect(out.y).toBeCloseTo(field.near[3 * 3 + 1], 5);
    expect(out.z).toBeCloseTo(field.near[3 * 3 + 2], 5);
    canyonPoint(field, 3, 1, out);
    expect(out.x).toBeCloseTo(field.apex.x, 5);
    expect(out.y).toBeCloseTo(field.apex.y, 5);
    expect(out.z).toBeCloseTo(field.apex.z, 5);
  });

  it('converges every trail on the same apex', () => {
    const field = createTrailField({ trailCount: 10 });
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < field.trailCount; i++) {
      canyonPoint(field, i, 1, out);
      expect(out.x).toBeCloseTo(field.apex.x, 5);
      expect(out.y).toBeCloseTo(field.apex.y, 5);
    }
  });

  it('produces finite points across every trail and s', () => {
    const field = createTrailField({ trailCount: 10 });
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < field.trailCount; i++) {
      for (let k = 0; k <= 10; k++) {
        canyonPoint(field, i, k / 10, out);
        expect(Number.isFinite(out.x)).toBe(true);
        expect(Number.isFinite(out.y)).toBe(true);
        expect(Number.isFinite(out.z)).toBe(true);
      }
    }
  });
});
