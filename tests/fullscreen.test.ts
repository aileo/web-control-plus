import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { button, click, loadSource, mount } from './helpers/controls.ts';

const FullscreenButton = loadSource('components/FullscreenButton').default;
const Header = loadSource('components/Header').default;
const render = () => React.createElement(FullscreenButton);

test('fullscreen targets the whole document and follows browser exits', async (t) => {
  const { dom } = await mount(t, {
    render: () => React.createElement(Header),
    configureWindow(window) {
      const { document: page } = window;
      let active: Element | null = null;
      const change = (element: Element | null) => {
        active = element;
        page.dispatchEvent(new window.Event('fullscreenchange'));
      };
      Object.defineProperties(page, {
        fullscreenEnabled: { value: true },
        fullscreenElement: { get: () => active },
        exitFullscreen: { value: async () => change(null) },
      });
      Object.defineProperty(page.documentElement, 'requestFullscreen', {
        value: async function enter(this: HTMLElement) {
          change(this);
        },
      });
    },
  });
  const { document: page } = dom.window;
  assert.ok(button('Save project'));
  assert.ok(button('Open project'));
  assert.ok(button('Download saved project'));
  await click(button('Enter fullscreen'));
  assert.ok(page.fullscreenElement === page.documentElement);
  await click(button('Exit fullscreen'));
  assert.equal(page.fullscreenElement, null);
  await click(button('Enter fullscreen'));
  await act(() => page.exitFullscreen());
  assert.ok(button('Enter fullscreen'));
});

test('fullscreen is hidden when the browser does not support it', async (t) => {
  await mount(t, { render });
  assert.equal(
    document.querySelector('button[aria-label*="fullscreen"]'),
    null
  );
});

test('a rejected fullscreen request leaves the action available and reports an error', async (t) => {
  const view = await mount(t, {
    render,
    configureWindow({ document: page }) {
      Object.defineProperties(page, {
        fullscreenEnabled: { value: true },
        exitFullscreen: { value: async () => {} },
      });
      Object.defineProperty(page.documentElement, 'requestFullscreen', {
        value: async () => {
          throw new Error('Fullscreen denied');
        },
      });
    },
  });
  await click(button('Enter fullscreen'));
  assert.equal(
    button('Enter fullscreen').getAttribute('aria-disabled'),
    'false'
  );
  assert.match(view.api.toastMessages[0].text, /Fullscreen denied/);
});
