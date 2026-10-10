import { describe, it, expect } from 'vitest';
import { DriftController } from '../../scripts/app/DriftController.js';

const on = { enabled: true, audioPaused: false, hidden: false };

it('fires once the interval elapses, then restarts the interval', () => {
  const d = new DriftController(60);
  expect(d.tick(40, on)).toBe(false);
  expect(d.tick(20, on)).toBe(true);
  expect(d.tick(10, on)).toBe(false);
});

it('freezes the timer while audio is paused or the tab is hidden', () => {
  const d = new DriftController(60);
  d.tick(50, on);
  expect(d.tick(50, { enabled: true, audioPaused: true, hidden: false })).toBe(false);
  expect(d.tick(50, { enabled: true, audioPaused: false, hidden: true })).toBe(false);
  expect(d.tick(10, on)).toBe(true);
});

it('does not run when disabled and reset() clears the accumulator', () => {
  const d = new DriftController(60);
  expect(d.tick(120, { enabled: false, audioPaused: false, hidden: false })).toBe(false);
  d.tick(50, on);
  d.reset();
  expect(d.tick(50, on)).toBe(false);
});
