import { describe, it, expect } from 'vitest';
import {
  createTrailField, canyonPoint,
  canyonTangent, canyonLateral, rippleAmount, advancePhotons,
} from '../../scripts/scenes/LightFallField.js';

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

  it('lifts every trail (and the apex) by yOffset', () => {
    const base = createTrailField({ trailCount: 4 });
    const lifted = createTrailField({ trailCount: 4, yOffset: 2.5 });
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    canyonPoint(base, 2, 0.5, a);
    canyonPoint(lifted, 2, 0.5, b);
    expect(b.y).toBeCloseTo(a.y + 2.5, 5);
    expect(lifted.apex.y).toBeCloseTo(base.apex.y + 2.5, 5);
    expect(lifted.near[2 * 3 + 1]).toBeCloseTo(base.near[2 * 3 + 1] + 2.5, 5);
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

const len = (v) => Math.hypot(v.x, v.y, v.z);

describe('canyon tangent and lateral frames', () => {
  it('returns unit tangents finite at the curve boundaries', () => {
    const field = createTrailField({ trailCount: 4 });
    const t = { x: 0, y: 0, z: 0 };
    for (const s of [0, 0.5, 1]) {
      canyonTangent(field, 1, s, t);
      expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)).toBe(true);
      expect(len(t)).toBeCloseTo(1, 4);
    }
  });

  it('returns unit laterals perpendicular to the tangent', () => {
    const field = createTrailField({ trailCount: 4 });
    const t = { x: 0, y: 0, z: 0 };
    const l = { x: 0, y: 0, z: 0 };
    canyonTangent(field, 2, 0.4, t);
    canyonLateral(field, 2, 0.4, l);
    expect(len(l)).toBeCloseTo(1, 4);
    expect(t.x * l.x + t.y * l.y + t.z * l.z).toBeCloseTo(0, 4);
  });
});

describe('scratch reuse', () => {
  it('does not clobber a caller output when later calls reuse the scratch', () => {
    const field = createTrailField({ trailCount: 4 });
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    canyonPoint(field, 1, 0.3, a);
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    canyonLateral(field, 1, 0.3, b);
    canyonTangent(field, 1, 0.3, b);
    expect(a.x).toBe(ax);
    expect(a.y).toBe(ay);
    expect(a.z).toBe(az);
  });
});

describe('rippleAmount', () => {
  it('is zero with no ripple and bounded by the ripple value', () => {
    const field = createTrailField({ trailCount: 4 });
    expect(rippleAmount(field, 0, 0.5, 0, 0)).toBeCloseTo(0, 10);
    for (let k = 0; k <= 10; k++) {
      expect(Math.abs(rippleAmount(field, 1, k / 10, 0.5, k))).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('advancePhotons', () => {
  const makeState = (n) => ({
    count: n,
    s: new Float32Array(n).fill(0.5),
    speed: new Float32Array(n).fill(1),
    track: new Float32Array(n),
  });

  it('moves progress down the trail', () => {
    const field = createTrailField({ trailCount: 2 });
    const state = makeState(2);
    advancePhotons(field, state, 0.1, 1);
    expect(state.s[0]).toBeCloseTo(0.4, 5);
  });

  it('keeps progress in [0,1) for a very large deltaTime', () => {
    const field = createTrailField({ trailCount: 2 });
    const state = makeState(2);
    advancePhotons(field, state, 1e6, 3);
    for (const v of state.s) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
