// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { GUIController } from '../../scripts/app/GUIController.js';

const state = { drift: { enabled: false, speedSeconds: 60, scope: 'visualizers' }, sceneIndex: 0, getVariantIndex: () => 0 };
const lineup = [{ id: 'a', name: 'A', variants: [{ name: 'one' }, { name: 'two' }] }];

it('the close button closes the panel through the toggleGui action', () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const actions = { toggleGui: vi.fn() };
  new GUIController({ root, state, actions, lineup, getDebugState: () => ({}) });
  root.querySelector('#gui-close').click();
  expect(actions.toggleGui).toHaveBeenCalledTimes(1);
});
