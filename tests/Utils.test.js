import { describe, it, expect } from 'vitest';
import { hasWebGL2 } from '../scripts/Utils.js';

it('is false when WebGL2 is unavailable', () => {
  expect(hasWebGL2(() => ({ getContext: () => null }))).toBe(false);
});

it('is true when a WebGL2 context is available', () => {
  expect(hasWebGL2(() => ({ getContext: () => ({}) }))).toBe(true);
});
