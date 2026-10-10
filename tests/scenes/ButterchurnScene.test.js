// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('butterchurn-presets', () => ({ default: { getPresets: () => ({ 'preset one': {}, 'preset two': {} }) } }));
vi.mock('butterchurn', () => ({
  default: { createVisualizer: () => ({ connectAudio() {}, loadPreset() {}, setRendererSize() {}, render() {} }) },
}));
vi.mock('../../scripts/scenes/ButterchurnSupport.js', () => ({ isButterchurnSupported: vi.fn(() => false) }));

import { isButterchurnSupported } from '../../scripts/scenes/ButterchurnSupport.js';
import { ButterchurnScene } from '../../scripts/scenes/ButterchurnScene.js';

const makeScene = () => new ButterchurnScene({ id: 'b', name: 'B', variants: [{ name: 'x' }], context: {} });

beforeEach(() => {
  document.body.innerHTML = '<div id="butterchurn-note"></div>';
  isButterchurnSupported.mockReset();
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
