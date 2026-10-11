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

it('lists the supported sources and omits tab audio when unsupported', () => {
  const root = document.createElement('div');
  const actions = { setAudioSource: vi.fn() };
  new GUIController({ root, state, actions, lineup, getDebugState: () => ({}), getAudioState: () => ({ source: 1, tabSupported: false }) });
  const values = [...root.querySelectorAll('#gui-source option')].map((o) => o.value);
  expect(values).toEqual(['1', '2']);
});

it('includes tab audio when supported and reports a selection', () => {
  const root = document.createElement('div');
  const actions = { setAudioSource: vi.fn() };
  const gui = new GUIController({ root, state, actions, lineup, getDebugState: () => ({}), getAudioState: () => ({ source: 1, tabSupported: true }) });
  expect([...root.querySelectorAll('#gui-source option')].map((o) => o.value)).toEqual(['1', '2', '3']);
  const select = root.querySelector('#gui-source');
  select.value = '2';
  select.dispatchEvent(new Event('change'));
  expect(actions.setAudioSource).toHaveBeenCalledWith(2);
  gui.sync(state);
});

it('shows a stopped option when there is no source', () => {
  const root = document.createElement('div');
  const actions = { setAudioSource: vi.fn() };
  new GUIController({ root, state, actions, lineup, getDebugState: () => ({}), getAudioState: () => ({ source: 0, tabSupported: true }) });
  expect(root.querySelector('#gui-source').value).toBe('0');
});
