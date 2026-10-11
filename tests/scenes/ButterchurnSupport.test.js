import { describe, it, expect } from 'vitest';
import { isButterchurnSupported } from '../../scripts/scenes/ButterchurnSupport.js';

it('is false without a WebGL2 context', () => {
  expect(isButterchurnSupported(() => ({ getContext: () => null }), { AudioContext: function () {} })).toBe(false);
});

it('is false without an audio context', () => {
  expect(isButterchurnSupported(() => ({ getContext: () => ({}) }), {})).toBe(false);
});

it('is true with both', () => {
  expect(isButterchurnSupported(() => ({ getContext: () => ({}) }), { AudioContext: function () {} })).toBe(true);
});
