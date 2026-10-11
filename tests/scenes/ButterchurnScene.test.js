// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createVisualizer, setRendererSize } = vi.hoisted(() => {
  const setRendererSize = vi.fn();
  const createVisualizer = vi.fn(() => ({
    connectAudio() {}, loadPreset() {}, setRendererSize, render() {},
  }));
  return { createVisualizer, setRendererSize };
});

vi.mock('butterchurn-presets', () => ({ default: { getPresets: () => ({ 'preset one': {}, 'preset two': {} }) } }));
vi.mock('butterchurn', () => ({ createVisualizer, default: { createVisualizer } }));
vi.mock('../../scripts/scenes/ButterchurnSupport.js', () => ({ isButterchurnSupported: vi.fn(() => false) }));

import { isButterchurnSupported } from '../../scripts/scenes/ButterchurnSupport.js';
import { ButterchurnScene } from '../../scripts/scenes/ButterchurnScene.js';

const makeScene = (context = {}) => new ButterchurnScene({ id: 'b', name: 'B', variants: [{ name: 'x' }], context });

const setViewport = (width, height) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

beforeEach(() => {
  document.body.innerHTML = '<div id="butterchurn-note"></div>';
  isButterchurnSupported.mockReset();
  createVisualizer.mockClear();
  setRendererSize.mockClear();
});

it('probes WebGL2 support only once across activations', () => {
  isButterchurnSupported.mockReturnValue(true);
  const scene = makeScene();
  scene.activate();
  scene.deactivate();
  scene.activate();
  expect(isButterchurnSupported).toHaveBeenCalledTimes(1);
});

it('hides the unsupported note when deactivated', () => {
  isButterchurnSupported.mockReturnValue(false);
  const scene = makeScene();
  scene.activate();
  expect(document.getElementById('butterchurn-note').style.display).toBe('block');
  scene.deactivate();
  expect(document.getElementById('butterchurn-note').style.display).toBe('none');
});

it('sizes the drawing buffer to the capped device resolution and renders 1:1', async () => {
  isButterchurnSupported.mockReturnValue(true);
  setViewport(1000, 500);
  const scene = makeScene({ pixelRatio: 2 });
  scene.activate();
  await vi.waitFor(() => expect(createVisualizer).toHaveBeenCalled());

  const canvas = document.getElementById('butterchurn-canvas');
  // The WebGL backbuffer must match the physical display size, not the browser's
  // 300x150 default — otherwise the visualizer renders into the corner.
  expect(canvas.width).toBe(2000);
  expect(canvas.height).toBe(1000);

  // Butterchurn's width/height are the backbuffer size; its own pixelRatio would
  // multiply them again, so it must be pinned to 1.
  expect(createVisualizer.mock.calls[0][2]).toMatchObject({ width: 2000, height: 1000, pixelRatio: 1 });
});

it('resizes the drawing buffer to the new viewport on resize', async () => {
  isButterchurnSupported.mockReturnValue(true);
  setViewport(1000, 500);
  const scene = makeScene({ pixelRatio: 2 });
  scene.activate();
  await vi.waitFor(() => expect(createVisualizer).toHaveBeenCalled());

  setViewport(800, 400);
  scene.resize(800, 400, 2);

  const canvas = document.getElementById('butterchurn-canvas');
  expect(canvas.width).toBe(1600);
  expect(canvas.height).toBe(800);
  expect(setRendererSize).toHaveBeenCalledWith(1600, 800, { pixelRatio: 1 });
});
