import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import {
  hasSameHubSignature,
  matchingOfflineHubUuids,
} from '../src/core/hub-replacement.ts';
import type { DeviceInfo, HubInfo } from '../src/core/types.ts';
import {
  DeviceType,
  HubType,
  createSourceLoader,
  lego,
} from './helpers/controls.ts';
import { asHtml, buttonElement, installDOM, present } from './helpers/dom.ts';

function hub(uuid: string, online: boolean): HubInfo {
  return {
    uuid,
    connectionOrder: 0,
    name: uuid,
    mac: uuid,
    online,
    type: lego.constToObject('HubType', HubType.TECHNIC_MEDIUM_HUB),
    color: '#8040c0',
    system: {},
  };
}

function device(
  uuid: string,
  port: string,
  type: number,
  connected: boolean
): DeviceInfo {
  return {
    uuid,
    mac: uuid,
    port,
    hubType: HubType.TECHNIC_MEDIUM_HUB,
    type: lego.constToObject('DeviceType', type),
    connected,
    events: {},
    commands: {},
  };
}

function inventory(uuid: string, connected: boolean) {
  return new Map([
    ['A', device(uuid, 'A', DeviceType.TRAIN_MOTOR, connected)],
    ['B', device(uuid, 'B', DeviceType.COLOR_DISTANCE_SENSOR, connected)],
    ['C', device(uuid, 'C', 0, false)],
  ]);
}

test('hub signatures require the same type and device-type/port set, ignoring empty ports', () => {
  const firstHub = hub('first', false);
  const secondHub = hub('second', true);
  const firstDevices = inventory('first', false);
  const secondDevices = inventory('second', true);

  assert.equal(
    hasSameHubSignature(firstHub, firstDevices, secondHub, secondDevices),
    true
  );
  assert.equal(
    hasSameHubSignature(
      firstHub,
      firstDevices,
      {
        ...secondHub,
        type: lego.constToObject('HubType', HubType.WEDO2_SMART_HUB),
      },
      secondDevices
    ),
    false
  );
  assert.equal(
    hasSameHubSignature(
      firstHub,
      firstDevices,
      secondHub,
      new Map([
        ['A', device('second', 'A', DeviceType.TRAIN_MOTOR, true)],
        ['C', device('second', 'C', DeviceType.COLOR_DISTANCE_SENSOR, true)],
      ])
    ),
    false
  );
});

test('matching candidates include multiple offline hubs and exclude connected and same-UUID hubs', () => {
  const hubs = new Map([
    ['first', hub('first', false)],
    ['second', hub('second', false)],
    ['online', hub('online', true)],
    ['new', hub('new', true)],
  ]);
  const devices = new Map([
    ['first', inventory('first', false)],
    ['second', inventory('second', false)],
    ['online', inventory('online', true)],
    [
      'new',
      new Map([
        ...inventory('new', true),
        ['stale', device('new', 'stale', DeviceType.TILT_SENSOR, false)],
      ]),
    ],
  ]);

  assert.deepEqual(matchingOfflineHubUuids('new', hubs, devices), [
    'first',
    'second',
  ]);
  assert.deepEqual(matchingOfflineHubUuids('missing', hubs, devices), []);
});

test('connect flow waits for delayed inventory; cancel is safe', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://localhost:8000/',
  });
  installDOM(t, dom.window);
  let hubs = new Map<string, HubInfo>([['old', hub('old', false)]]);
  let devices = new Map<string, Map<string, DeviceInfo>>([
    ['old', inventory('old', false)],
  ]);
  let refresh: (() => void) | undefined;
  const replacements: [string, string][] = [];
  const hooks = {
    useAddHub: () => async () => {
      hubs = new Map(hubs).set('new', hub('new', true));
      devices = new Map(devices).set('new', new Map());
      return { uuid: 'new', name: 'new' };
    },
    useConnectingHub: () => false,
    useDevices: () => devices,
    useHubs: () => hubs,
    usePostMessage: () => () => undefined,
    useReplaceOfflineHubControls:
      () => async (oldUuid: string, newUuid: string) => {
        replacements.push([oldUuid, newUuid]);
      },
    useSetHubMenu: () => () => refresh?.(),
  };
  const ConnectHub = createSourceLoader({ hooks })(
    'components/modules/hubs/ConnectHub'
  ).default;
  const require = createRequire(import.meta.url);
  const { CacheProvider } =
    require('@emotion/react') as typeof import('@emotion/react');
  const { default: createCache } =
    require('@emotion/cache') as typeof import('@emotion/cache');
  const { ThemeProvider, createTheme } =
    require('@mui/material/styles') as typeof import('@mui/material/styles');
  const root = createRoot(present(document.getElementById('root')));
  const cache = createCache({ key: 'replace-test', container: document.head });
  const originalSetTimeout = window.setTimeout.bind(window);
  const accelerateInventoryTimeout = (callback: TimerHandler, delay?: number) =>
    originalSetTimeout(callback, (delay ?? 0) >= 9000 ? 0 : delay);
  function App() {
    const [, setRender] = React.useState(0);
    refresh = () => setRender((value) => value + 1);
    return React.createElement(ConnectHub);
  }
  try {
    await act(() =>
      root.render(
        React.createElement(
          CacheProvider,
          { value: cache },
          React.createElement(
            ThemeProvider,
            { theme: createTheme() },
            React.createElement(App)
          )
        )
      )
    );

    window.setTimeout = accelerateInventoryTimeout as typeof window.setTimeout;
    await act(async () => {
      asHtml(
        buttonElement(document, 'button[aria-label="Connect hub"]')
      ).click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    await act(
      () =>
        new Promise((resolve) => {
          originalSetTimeout(resolve, 0);
        })
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    window.setTimeout = originalSetTimeout;
    devices = new Map(devices).set('new', inventory('new', true));
    await act(() => refresh?.());
    assert.ok(document.querySelector('[role="dialog"]'));
    const cancel = present(
      [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === 'Cancel'
      )
    );
    await act(() => asHtml(cancel).click());
    assert.equal(replacements.length, 0);
    assert.equal(hubs.get('old')?.online, false);
  } finally {
    window.setTimeout = originalSetTimeout;
    await act(() => root.unmount());
  }
});
