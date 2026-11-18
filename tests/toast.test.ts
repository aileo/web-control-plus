import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createSourceLoader } from './helpers/controls.ts';
import { installDOM, present, query, html } from './helpers/dom.ts';

test('toast hooks, display, independent timers, and cleanup', async (t) => {
  const timers = new Map<number, { callback: () => void; duration: number }>();
  let nextTimer = 0;
  const load = createSourceLoader({
    globals: {
      setTimeout: (callback: () => void, duration: number) => {
        const id = nextTimer;
        nextTimer += 1;
        timers.set(id, { callback, duration });
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  });
  const hooks = load('hooks/useToast');
  for (const hook of [
    hooks.usePostMessage,
    hooks.useToastMessages,
    hooks.useDismissMessage,
  ]) {
    const OutsideProvider = () => {
      hook();
      return null;
    };
    assert.throws(
      () => renderToStaticMarkup(React.createElement(OutsideProvider)),
      /useToast must be used within a ToastProvider/
    );
  }
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  installDOM(t, dom.window);
  const require = createRequire(import.meta.url);
  const { CacheProvider } =
    require('@emotion/react') as typeof import('@emotion/react');
  const { default: createCache } =
    require('@emotion/cache') as typeof import('@emotion/cache');
  const { default: ToastViewport } = load('components/ToastViewport');
  const cache = createCache({ key: 'toast-test', container: document.head });
  const root = createRoot(present(document.getElementById('root')));
  function useAPI() {
    return {
      post: hooks.usePostMessage(),
      messages: hooks.useToastMessages(),
      dismiss: hooks.useDismissMessage(),
    };
  }
  let current: ReturnType<typeof useAPI> | undefined;
  const api = () => present(current);
  function Probe() {
    current = useAPI();
    return React.createElement(ToastViewport);
  }
  async function posted(
    message: Parameters<ReturnType<typeof useAPI>['post']>[0]
  ) {
    let id: ReturnType<ReturnType<typeof useAPI>['post']> | undefined;
    await act(() => {
      id = api().post(message);
    });
    return present(id);
  }
  try {
    await act(() =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            CacheProvider,
            { value: cache },
            React.createElement(
              hooks.ToastProvider,
              null,
              React.createElement(Probe)
            )
          )
        )
      )
    );
    const region = query(document, '[aria-label="Notifications"]');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    const position = window.getComputedStyle(region);
    assert.equal(position.position, 'fixed');
    assert.equal(position.bottom, '16px');
    assert.equal(position.right, '16px');
    assert.equal(region.querySelector('[role="status"], [role="alert"]'), null);
    const first = await posted({ text: 'Connected', level: 'success' });
    const originalTimer = [...timers.keys()][0];
    const second = await posted({
      text: 'Problem',
      level: 'error',
      duration: 100,
      icon: React.createElement('span', { 'data-testid': 'custom-icon' }, '!'),
    });
    assert.notEqual(first, second);
    assert.equal(api().messages.length, 2);
    assert.ok(timers.has(originalTimer));
    assert.deepEqual(
      [...timers.values()].map((timer) => timer.duration).sort(),
      [100, 3000]
    );
    assert.equal(query(document, '[role="status"]').textContent, 'Connected');
    assert.equal(query(document, '[role="alert"]').textContent, '!Problem');
    assert.ok(document.querySelector('[data-testid="custom-icon"]'));

    const short = present(
      [...timers.entries()].find(([, timer]) => timer.duration === 100)
    );
    await act(() => {
      timers.delete(short[0]);
      short[1].callback();
    });
    assert.equal(api().messages.length, 1);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(timers.size, 1);
    await act(() => html(document, '[aria-label="Close"]').click());
    assert.equal(api().messages.length, 0);
    assert.equal(timers.size, 0);
    assert.equal(region.querySelector('[role="status"], [role="alert"]'), null);

    const third = await posted({ text: 'Default level', duration: 0 });
    assert.equal(
      query(document, '[role="status"]').textContent,
      'Default level'
    );
    assert.equal([...timers.values()][0].duration, 0);
    await act(() => api().dismiss(third));
    assert.equal(timers.size, 0);
    assert.throws(
      () => api().post({ text: 'Bad', duration: -1 }),
      /Invalid toast duration/
    );
    assert.throws(
      () => api().post({ text: 'Bad', duration: NaN }),
      /Invalid toast duration/
    );
    assert.throws(
      () =>
        Reflect.apply(api().post, undefined, [{ text: 'Bad', level: 'bad' }]),
      /Invalid toast level/
    );
    await posted({ text: 'Cleanup' });
    assert.equal(timers.size, 1);
  } finally {
    await act(() => root.unmount());
    assert.equal(timers.size, 0);
  }
});
