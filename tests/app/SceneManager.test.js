import { describe, it, expect, vi } from 'vitest';
import { SceneManager } from '../../scripts/app/SceneManager.js';

const makeScene = (variants) => ({ variants, activate: vi.fn(), deactivate: vi.fn(), setVariant: vi.fn(), update: vi.fn(), resize: vi.fn(), dispose: vi.fn() });
const defs = [
  { id: 'a', name: 'A', variants: [{ name: 'd' }], create: vi.fn(() => makeScene([{ name: 'd' }])) },
  { id: 'b', name: 'B', variants: [{ name: 'd' }], create: vi.fn(() => makeScene([{ name: 'd' }])) },
];
const ctx = { renderer: {}, width: 800, height: 600, pixelRatio: 1, platformMobile: false };

it('creates the first scene lazily and activates it', () => {
  const m = new SceneManager(defs, ctx);
  expect(m.activeScene).toBeNull();
  const s = m.activate(0);
  expect(s.activate).toHaveBeenCalledTimes(1);
  expect(m.activeIndex).toBe(0);
});

it('deactivates the old scene, reuses instances on revisit', () => {
  const m = new SceneManager(defs, ctx);
  const a = m.activate(0);
  const b = m.activate(1);
  expect(a.deactivate).toHaveBeenCalledTimes(1);
  expect(b.activate).toHaveBeenCalledTimes(1);
  const a2 = m.activate(0);
  expect(a2).toBe(a);
  expect(defs[0].create).toHaveBeenCalledTimes(1);
});

it('dispatches update/resize/variant to the active scene only', () => {
  const m = new SceneManager(defs, ctx);
  const a = m.activate(0);
  const b = m.activate(1);
  m.update({}, {}, 0.016);
  m.resize(100, 100, 1);
  m.setActiveVariant(0);
  expect(b.update).toHaveBeenCalledTimes(1);
  expect(a.update).not.toHaveBeenCalled();
  expect(b.resize).toHaveBeenCalledWith(100, 100, 1);
  expect(b.setVariant).toHaveBeenCalledWith(0);
});
