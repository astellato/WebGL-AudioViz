import { describe, it, expect, vi } from 'vitest';

vi.mock('../../scripts/PostProcessHandler.js', () => ({
  PostProcessHandler: class {
    setSize() {} render() {} addRenderPass() {} addUnrealBloomPass() {}
    addOutputPass() {} addAfterImagePass() {}
  },
}));

import { LightFallScene, lightFallSceneDefinition } from '../../scripts/scenes/LightFallScene.js';

const fakeAudio = () => ({
  getRelativeTotal: () => 0,
  getSpectrum: () => new Float32Array(256),
  getAverage: () => 0,
});
const fakeBeats = () => ({ onBeat: false, strength: 0, location: 0, band: 0 });
const makeScene = (platformMobile = false) => new LightFallScene({
  id: 'lightfall',
  name: 'Light Fall',
  variants: lightFallSceneDefinition.variants,
  renderer: { render: vi.fn() },
  context: { width: 800, height: 600, pixelRatio: 1, platformMobile },
});

it('keeps the scene id, name and five variants', () => {
  expect(lightFallSceneDefinition.id).toBe('lightfall');
  expect(lightFallSceneDefinition.variants).toHaveLength(5);
});

it('applies a variant before build without throwing', () => {
  const scene = makeScene();
  expect(() => scene.setVariant(2)).not.toThrow();
});

it('builds and updates on silent audio without NaN', () => {
  const scene = makeScene();
  scene.activate();
  expect(lightFallSceneDefinition.create({ renderer: { render: vi.fn() }, platformMobile: false })).toBeTruthy();
  scene.update(fakeAudio(), fakeBeats(), 0.016);
  for (const m of scene.photonMesh.instanceMatrix.array) {
    expect(Number.isFinite(m)).toBe(true);
  }
});

it('uses a smaller tier on mobile', () => {
  const desktop = makeScene(false);
  const mobile = makeScene(true);
  desktop.activate(); mobile.activate();
  expect(mobile.photonMesh.count).toBeLessThan(desktop.photonMesh.count);
});
