import { describe, it, expect, vi } from 'vitest';
import { ControlState } from '../../scripts/app/ControlState.js';

const defs = [{ id: 'a', variantCount: 3 }, { id: 'b', variantCount: 2 }];

const randomDefs = [
  { id: 'a', variantCount: 3, randomStartVariant: true },
  { id: 'b', variantCount: 2, randomStartVariant: true },
];

it('seeds a random variant on a fresh start when the scene opts in', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  const s = new ControlState(randomDefs);
  expect(s.getVariantIndex('a')).toBe(2); // floor(0.9 * 3)
  expect(s.getVariantIndex('b')).toBe(1); // floor(0.9 * 2)
  vi.restoreAllMocks();
});

it('still starts at the first variant for scenes without the opt-in flag', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  const s = new ControlState(defs);
  expect(s.getVariantIndex('a')).toBe(0);
  expect(s.getVariantIndex('b')).toBe(0);
  vi.restoreAllMocks();
});

it('keeps a saved variant even when the scene opts into a random start', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  const s = new ControlState(randomDefs, { variantIndexByScene: { a: 1 } });
  expect(s.getVariantIndex('a')).toBe(1); // saved wins
  expect(s.getVariantIndex('b')).toBe(1); // no saved value -> random
  vi.restoreAllMocks();
});

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
