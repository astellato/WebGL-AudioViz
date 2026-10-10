import { describe, it, expect } from 'vitest';
import { ControlState } from '../../scripts/app/ControlState.js';

const defs = [{ id: 'a', variantCount: 3 }, { id: 'b', variantCount: 2 }];

it('wraps scenes and remembers a variant per scene', () => {
  const s = new ControlState(defs);
  expect(s.sceneIndex).toBe(0);
  expect(s.nextScene()).toBe(1);
  expect(s.nextVariant('b')).toBe(1);
  expect(s.nextScene()).toBe(0); // wraps
  expect(s.getVariantIndex('a')).toBe(0);
  expect(s.getVariantIndex('b')).toBe(1); // remembered
});

it('disables drift on a manual switch but not on a drift step', () => {
  const s = new ControlState(defs);
  s.setDriftEnabled(true);
  s.driftStep();
  expect(s.drift.enabled).toBe(true);
  s.nextScene();
  expect(s.drift.enabled).toBe(false);
});

it('drift scope "variants" advances only the active scene variant', () => {
  const s = new ControlState(defs);
  s.setDriftScope('variants');
  s.driftStep();
  expect(s.getVariantIndex('a')).toBe(1);
  expect(s.sceneIndex).toBe(0);
});

it('drift scope "both" walks variants then advances the scene', () => {
  const s = new ControlState(defs);
  s.setDriftScope('both');
  s.driftStep();
  expect(s.getVariantIndex('a')).toBe(1);
  s.driftStep();
  expect(s.getVariantIndex('a')).toBe(2);
  s.driftStep();
  expect(s.sceneIndex).toBe(1);
  expect(s.getVariantIndex('a')).toBe(0);
});

it('notifies subscribers on mutation', () => {
  const s = new ControlState(defs);
  let n = 0;
  const off = s.subscribe(() => { n++; });
  s.nextScene();
  off();
  s.nextScene();
  expect(n).toBe(1);
});
