import { describe, it, expect, vi } from 'vitest';

vi.mock('../../scripts/PostProcessHandler.js', () => ({
  PostProcessHandler: class {
    setSize() {} render() {} addRenderPass() {} addSobelPass() {} addUnrealBloomPass() {}
    addRGBShiftPass() {} addAfterImagePass() {} addFXAAPass() {} addFilmGrainPass() {}
    addOutputPass() {} enableSobelPass() {}
  },
}));

import { ThreeVisualizer } from '../../scripts/scenes/ThreeVisualizer.js';

class TestScene extends ThreeVisualizer {
  constructor(renderer) {
    super({ id: 't', name: 'Test', variants: [{ name: 'one' }, { name: 'two' }], renderer, context: { platformMobile: false }, usePostProcess: false });
    this.built = 0;
    this.updated = 0;
    this.applied = null;
  }
  build() { this.built++; }
  onUpdate() { this.updated++; }
  applyVariant(v, i) { this.applied = i; }
}

const renderer = { render: vi.fn() };

it('builds lazily on activate and renders on update', () => {
  const s = new TestScene(renderer);
  expect(s.built).toBe(0);
  s.update({}, {}, 0.016);
  expect(s.updated).toBe(0); // inactive
  s.activate();
  expect(s.built).toBe(1);
  s.update({}, {}, 0.016);
  expect(s.updated).toBe(1);
  expect(renderer.render).toHaveBeenCalledTimes(1);
});

it('clamps and applies variants; deactivate stops updates', () => {
  const s = new TestScene(renderer);
  s.activate();
  s.setVariant(5); // clamps to last
  expect(s.applied).toBe(1);
  s.deactivate();
  s.update({}, {}, 0.016);
  expect(s.updated).toBe(0);
});
