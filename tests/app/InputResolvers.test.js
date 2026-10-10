import { describe, it, expect } from 'vitest';
import { resolveNewKey, resolveSwipe } from '../../scripts/app/InputResolvers.js';

it('maps the new keys to intents', () => {
  expect(resolveNewKey('ArrowRight')).toBe('scene-next');
  expect(resolveNewKey('ArrowLeft')).toBe('scene-prev');
  expect(resolveNewKey('ArrowDown')).toBe('variant-next');
  expect(resolveNewKey('ArrowUp')).toBe('variant-prev');
  expect(resolveNewKey('KeyD')).toBe('drift-toggle');
  expect(resolveNewKey('KeyH')).toBe('gui-toggle');
  expect(resolveNewKey('KeyQ')).toBe(null);
});

it('resolves swipes by dominant axis and threshold', () => {
  expect(resolveSwipe(-50, 10, 40)).toEqual({ axis: 'scene', direction: 1 });
  expect(resolveSwipe(50, 10, 40)).toEqual({ axis: 'scene', direction: -1 });
  expect(resolveSwipe(10, -50, 40)).toEqual({ axis: 'variant', direction: 1 });
  expect(resolveSwipe(10, 50, 40)).toEqual({ axis: 'variant', direction: -1 });
  expect(resolveSwipe(30, 30, 40)).toEqual({ axis: null, direction: 0 });
  expect(resolveSwipe(5, 5, 40)).toEqual({ axis: null, direction: 0 });
});
