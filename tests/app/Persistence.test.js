import { describe, it, expect } from 'vitest';
import { loadControlState, saveControlState } from '../../scripts/app/Persistence.js';

const defs = [{ id: 'a', variantCount: 3 }, { id: 'b', variantCount: 2 }];
const defaults = { sceneIndex: 0, variantIndexByScene: {}, drift: { enabled: false, speedSeconds: 60, scope: 'visualizers' } };
const storage = (raw) => ({ getItem: () => raw, setItem: () => {} });

it('returns defaults for missing or corrupt storage', () => {
  expect(loadControlState(storage(null), defs)).toEqual(defaults);
  expect(loadControlState(storage('{not json'), defs)).toEqual(defaults);
});

it('drops unknown scenes, clamps indices, validates drift', () => {
  const raw = JSON.stringify({ sceneIndex: 9, variantIndexByScene: { a: 99, zz: 1 }, drift: { enabled: 'yes', speedSeconds: 7, scope: 'nope' } });
  const st = loadControlState(storage(raw), defs);
  expect(st.sceneIndex).toBe(1);
  expect(st.variantIndexByScene).toEqual({ a: 2 });
  expect(st.drift).toEqual({ enabled: true, speedSeconds: 60, scope: 'visualizers' });
});

it('round-trips through save/load', () => {
  let written = null;
  const s = { getItem: () => written, setItem: (_k, v) => { written = v; } };
  saveControlState(s, { sceneIndex: 1, variantIndexByScene: { b: 1 }, drift: { enabled: true, speedSeconds: 120, scope: 'both' } });
  expect(loadControlState(s, defs).variantIndexByScene).toEqual({ b: 1 });
});
