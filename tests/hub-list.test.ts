import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import tinycolor from 'tinycolor2';
import {
  createSourceLoader,
  navigation,
  lego as legoClient,
  visibleText,
} from './helpers/controls.ts';
import {
  asButton,
  asHtml,
  buttonElement,
  html,
  installDOM,
  present,
  query,
} from './helpers/dom.ts';

interface TestHub {
  uuid: string;
  name: string;
  online: boolean;
  type: { compact: string };
  color: string;
  system?: { batteryLevel: number };
}
interface TestDevice {
  connected: boolean;
  type: { num?: number; text: string };
}
type HubAction = 'disconnect' | 'shutdown' | 'remove';
type Action = [HubAction, string] | [string, { uuid: string; port?: string }];
type Connected = Pick<TestHub, 'uuid' | 'name'>;

test('hub toolbar renders a Map and handles pending and failed connections', async (t) => {
  const dom = new JSDOM('<div id="root"></div>');
  installDOM(t, dom.window);
  const require = createRequire(import.meta.url);
  const { CacheProvider } =
    require('@emotion/react') as typeof import('@emotion/react');
  const { default: createCache } =
    require('@emotion/cache') as typeof import('@emotion/cache');
  const { ThemeProvider, createTheme, hexToRgb, getContrastRatio } =
    require('@mui/material/styles') as typeof import('@mui/material/styles');
  let hubs = new Map<string, TestHub>();
  const devices = new Map<string, Map<string | null | undefined, TestDevice>>();
  let rejectConnection: ((error: Error) => void) | undefined;
  let resolveConnection: ((hub: Connected) => void) | undefined;
  let attempts = 0;
  let connecting = false;
  const messages: { text: string; level: string }[] = [];
  const actions: Action[] = [];
  let actionError: Error | null = null;
  let pendingAction: Promise<void> | undefined;
  const runAction = async (name: HubAction, uuid: string) => {
    actions.push([name, uuid]);
    if (actionError) throw actionError;
    await pendingAction;
  };
  const hooks = {
    useHub: (uuid: string) => hubs.get(uuid),
    useDisconnectHub: () => (uuid: string) => runAction('disconnect', uuid),
    useShutdownHub: () => (uuid: string) => runAction('shutdown', uuid),
    useRemoveHub: () => (uuid: string) => runAction('remove', uuid),
    useOpenModal:
      () =>
      (...args: Action) =>
        actions.push(args),
    useDevices: () => new Map(),
    useHubs: () => hubs,
    useHubDevices: (uuid: string) => devices.get(uuid) || new Map(),
    useDevice: (uuid: string, port: string) => devices.get(uuid)?.get(port),
    useDevicesError: () => null,
    useHubMenu: navigation.useHubMenu,
    useSetHubMenu: navigation.useSetHubMenu,
    useHubShortcut: navigation.useHubShortcut,
    useModal: () => ({ name: null }),
    useConnectingHub: () => connecting,
    useAddHub: () => {
      const [, rerender] = React.useState(0);
      return () => {
        attempts += 1;
        connecting = true;
        rerender((value) => value + 1);
        return new Promise<Connected>((resolve, reject) => {
          resolveConnection = resolve;
          rejectConnection = reject;
        }).finally(() => {
          connecting = false;
          rerender((value) => value + 1);
        });
      };
    },
    useReplaceOfflineHubControls: () => async () => undefined,
    usePostMessage: () => (message: { text: string; level: string }) =>
      messages.push(message),
  };
  const load = createSourceLoader({ hooks });
  const HubList = load('components/modules/hubs/HubList').default;
  const Device = load('components/modules/hubs/Device').default;
  const root = createRoot(present(document.getElementById('root')));
  const theme = createTheme({
    palette: {
      primary: { main: '#4a148c', contrastText: '#ffffff' },
      warning: { main: '#ffcc80', contrastText: '#000000' },
      error: { main: '#b71c1c', contrastText: '#ffffff' },
    },
    components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
  });
  const cache = createCache({ key: 'test', container: document.head });
  const render = () =>
    root.render(
      React.createElement(
        CacheProvider,
        { value: cache },
        React.createElement(
          ThemeProvider,
          { theme },
          React.createElement(
            navigation.NavigationProvider,
            null,
            React.createElement(HubList)
          )
        )
      )
    );
  try {
    await act(render);
    assert.ok(document.querySelector('nav[aria-label="Hubs"]'));
    const connect = document.querySelector('button[aria-label="Connect hub"]');
    assert.ok(connect);
    assert.equal(visibleText(connect), '');
    assert.equal(
      window.getComputedStyle(connect).backgroundColor,
      hexToRgb(theme.palette.primary.main)
    );
    assert.equal(
      window.getComputedStyle(connect).color,
      hexToRgb(theme.palette.primary.contrastText)
    );
    assert.doesNotMatch(
      window.getComputedStyle(connect).backgroundImage,
      /gradient/
    );
    assert.equal(
      document.querySelectorAll('[aria-haspopup="dialog"]').length,
      0
    );
    hubs = new Map([
      [
        'one',
        {
          uuid: 'one',
          name: 'First hub',
          online: true,
          type: { compact: 'BMH' },
          color: '#64b5f6',
          system: { batteryLevel: 80 },
        },
      ],
      [
        'two',
        {
          uuid: 'two',
          name: '',
          online: false,
          type: { compact: 'TMH' },
          color: '#00ff00',
        },
      ],
    ]);
    await act(render);
    const orderedButtons = [
      ...document.querySelectorAll('[aria-haspopup="dialog"]'),
    ];
    assert.deepEqual(
      orderedButtons.map((button) => button.getAttribute('aria-label')),
      ['two actions', 'First hub actions']
    );
    const buttons = [...orderedButtons].reverse();
    const accent = tinycolor(
      window.getComputedStyle(buttons[0]).borderBottomColor
    );
    const assigned = tinycolor(present(hubs.get('one')).color);
    assert.ok(accent.toHsl().s > assigned.toHsl().s);
    assert.ok(accent.toHsl().l < assigned.toHsl().l);
    assert.ok(Math.abs(accent.toHsl().h - assigned.toHsl().h) < 1);
    assert.equal(present(hubs.get('one')).color, '#64b5f6');
    assert.deepEqual(buttons.map(visibleText), ['BMH80%', 'TMH--']);
    hubs = new Map(hubs).set('three', {
      uuid: 'three',
      name: 'Latest hub',
      online: true,
      type: { compact: 'H' },
      color: '#0000ff',
    });
    await act(render);
    const updatedButtons = [
      ...document.querySelectorAll('[aria-haspopup="dialog"]'),
    ];
    assert.deepEqual(
      updatedButtons.map((button) => button.getAttribute('aria-label')),
      ['Latest hub actions', 'two actions', 'First hub actions']
    );
    assert.equal(updatedButtons[1], buttons[1]);
    assert.equal(updatedButtons[2], buttons[0]);
    assert.equal(
      query(document, 'nav').classList.contains('MuiPaper-root'),
      false
    );
    buttons.forEach((button) => {
      button.getBoundingClientRect = () => new window.DOMRect(10, 10, 40, 40);
    });
    const actionButton = (name: string) =>
      buttonElement(document, `[role="dialog"] button[aria-label="${name}"]`);
    const openHub = async (index: number) => {
      await act(() => {
        asHtml(buttons[index]).focus();
        asHtml(buttons[index]).click();
      });
    };
    const unnamed = new Map(
      [undefined, null, '', '  '].map((port) => [
        port,
        { connected: true, type: { text: 'TRAIN_MOTOR' } },
      ])
    );
    devices.set('one', unnamed);
    await openHub(0);
    assert.equal(buttons[0].getAttribute('aria-expanded'), 'true');
    const headerTitle = () =>
      present(
        document.getElementById(
          present(
            query(document, '[role="dialog"]').getAttribute('aria-labelledby')
          )
        )
      );
    assert.equal(present(headerTitle()).textContent, 'First hub');
    assert.equal(present(headerTitle()).title, 'First hub');
    assert.equal(
      present(headerTitle().nextElementSibling).textContent,
      'Online - Battery 80%'
    );
    const firstHub = present(hubs.get('one'));
    const longName = 'My very long LEGO hub name that needs to be shortened';
    hubs = new Map(hubs).set('one', {
      ...firstHub,
      name: longName,
      system: { batteryLevel: 0 },
    });
    await act(render);
    assert.equal(present(headerTitle()).textContent, longName);
    assert.equal(present(headerTitle()).title, longName);
    assert.equal(
      present(headerTitle().nextElementSibling).textContent,
      'Online - Battery 0%'
    );
    hubs = new Map(hubs).set('one', present(firstHub));
    await act(render);
    assert.ok(document.body.textContent.includes('No devices available'));
    assert.equal(
      document.querySelectorAll('ul[aria-labelledby$="-devices"] li').length,
      0
    );
    const actionNames = [
      'Configure hub',
      'Disconnect hub',
      'Shutdown hub',
      'Remove hub',
    ];
    const actionIcons = [
      'Build',
      'LinkOff',
      'PowerSettingsNew',
      'DeleteForever',
    ];
    const group = document.querySelector(
      '[role="group"][aria-label="Hub actions"]'
    );
    assert.deepEqual(
      [...present(group).querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label')
      ),
      actionNames
    );
    assert.equal(visibleText(present(group)), '');
    actionNames.forEach((name, index) => {
      assert.ok(
        present(actionButton(name)).querySelector(
          `[data-testid="${actionIcons[index]}Icon"]`
        )
      );
      const wrapper = present(actionButton(name).parentElement);
      const descriptionId = wrapper.getAttribute('aria-describedby');
      const description = descriptionId
        ? document.getElementById(descriptionId)
        : null;
      assert.equal(present(wrapper).title || description?.textContent, name);
      if (!asButton(actionButton(name)).disabled) {
        const palette =
          theme.palette[
            (['primary', 'warning', 'error', 'error'] as const)[index]
          ];
        const style = window.getComputedStyle(present(actionButton(name)));
        assert.equal(style.backgroundColor, hexToRgb(palette.main));
        assert.equal(style.color, hexToRgb(palette.contrastText));
        assert.ok(getContrastRatio(style.color, style.backgroundColor) >= 3);
      }
    });
    assert.equal(document.activeElement, actionButton('Configure hub'));
    const disabledRemove = actionButton('Remove hub');
    const removeWrapper = present(disabledRemove).parentElement;
    present(removeWrapper).getBoundingClientRect =
      buttons[0].getBoundingClientRect;
    await act(async () => {
      present(removeWrapper).dispatchEvent(
        new window.MouseEvent('mouseover', { bubbles: true })
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    });
    assert.ok(
      [...document.querySelectorAll('[role="tooltip"]')].some(
        (tooltip) => tooltip.textContent === 'Remove hub'
      )
    );
    await act(() =>
      present(removeWrapper).dispatchEvent(
        new window.MouseEvent('mouseout', { bubbles: true })
      )
    );
    await act(() => asHtml(disabledRemove).click());
    assert.equal(actions.length, 0);
    await act(() =>
      present(document.activeElement).dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    assert.equal(buttons[0].getAttribute('aria-expanded'), null);
    assert.equal(document.activeElement, buttons[0]);
    await openHub(0);
    await act(() => html(document, '.MuiBackdrop-root').click());
    assert.equal(buttons[0].getAttribute('aria-expanded'), null);
    assert.equal(document.activeElement, buttons[0]);
    await openHub(0);
    devices.set(
      'one',
      new Map<string | null | undefined, TestDevice>([
        ['A', { connected: true, type: { text: 'NEW_DEVICE_TYPE' } }],
        ['B', { connected: false, type: { text: 'TRAIN_MOTOR' } }],
        [
          'C',
          {
            connected: true,
            type: {
              num: legoClient.CONSTS.DeviceType.TECHNIC_LARGE_LINEAR_MOTOR,
              text: 'TECHNIC_LARGE_LINEAR_MOTOR',
            },
          },
        ],
        ['D', { connected: true, type: { text: 'TECHNIC_DISTANCE_SENSOR' } }],
        ['E', { connected: false, type: { text: 'UNKNOWN' } }],
        [
          'VOLTAGE_SENSOR',
          { connected: true, type: { text: 'VOLTAGE_SENSOR' } },
        ],
        [
          'CURRENT_SENSOR',
          { connected: true, type: { text: 'CURRENT_SENSOR' } },
        ],
        ['LED', { connected: true, type: { text: 'HUB_LED' } }],
        ...unnamed,
      ])
    );
    await act(render);
    const deviceList = document.querySelector(
      'ul[aria-labelledby$="-devices"]'
    );
    assert.ok(deviceList);
    assert.deepEqual([...deviceList.querySelectorAll('li')].map(visibleText), [
      'Unknown devicePort A - Connected',
      'Train motorPort B - Disconnected',
      'Big motorPort C - Connected',
      'Distance sensorPort D - Connected',
      'Empty portPort E - Disconnected',
      'Voltage sensorBuilt-in - Connected',
      'Current sensorBuilt-in - Connected',
      'Hub lightBuilt-in - Connected',
    ]);
    const tile = (port: string) =>
      present(
        [...deviceList.querySelectorAll('li')].find((li) =>
          li.getAttribute('aria-label')?.startsWith(`${port}:`)
        )
      );
    const icon = (port: string, name: string) =>
      present(tile(port)).querySelector(`[data-testid="${name}Icon"]`);
    assert.ok(icon('A', 'QuestionMark'));
    assert.ok(icon('B', 'DirectionsRailway'));
    assert.ok(icon('C', 'Autorenew'));
    assert.ok(icon('D', 'Straighten'));
    assert.ok(icon('VOLTAGE_SENSOR', 'BatteryStd'));
    assert.ok(icon('CURRENT_SENSOR', 'FlashOn'));
    assert.ok(icon('LED', 'Lightbulb'));
    assert.equal(deviceList.textContent.includes('TECHNIC_'), false);
    assert.equal(
      present(tile('C')).title,
      'C - TECHNIC_LARGE_LINEAR_MOTOR - Connected - Create control'
    );
    assert.equal(
      present(tile('VOLTAGE_SENSOR')).title,
      'VOLTAGE_SENSOR - VOLTAGE_SENSOR - Connected'
    );
    assert.equal(
      window.getComputedStyle(present(tile('B'))).opacity,
      window.getComputedStyle(present(actionButton('Remove hub'))).opacity
    );
    assert.equal(window.getComputedStyle(present(tile('A'))).opacity, '1');
    const createControl = deviceList.querySelector(
      'button[aria-label="Create control for C: Big motor"]'
    );
    assert.ok(createControl);
    assert.equal(deviceList.querySelector('[data-testid="AddIcon"]'), null);
    await act(() => asHtml(createControl).click());
    const createAction = actions.pop();
    assert.ok(createAction && typeof createAction[1] === 'object');
    assert.equal(createAction[0], 'createControl');
    assert.equal(createAction[1].uuid, 'one');
    assert.equal(createAction[1].port, 'C');
    await openHub(0);
    assert.equal(
      document.querySelector(
        '[role="dialog"] button[aria-label="Create control"]'
      ),
      null
    );
    assert.equal(asButton(actionButton('Remove hub')).disabled, true);
    await act(() => asHtml(actionButton('Configure hub')).click());
    const configAction = actions.pop();
    assert.ok(configAction && typeof configAction[1] === 'object');
    assert.equal(configAction[0], 'hubConfig');
    assert.equal(configAction[1].uuid, 'one');
    await openHub(0);
    await act(() => asHtml(actionButton('Disconnect hub')).click());
    assert.deepEqual(actions.pop(), ['disconnect', 'one']);
    await openHub(0);
    await act(() => asHtml(actionButton('Shutdown hub')).click());
    assert.deepEqual(actions.pop(), ['shutdown', 'one']);
    await openHub(1);
    assert.equal(present(headerTitle()).textContent, 'two');
    assert.equal(present(headerTitle()).title, 'two');
    assert.equal(
      present(headerTitle().nextElementSibling).textContent,
      'Offline'
    );
    assert.ok(document.body.textContent.includes('No devices available'));
    assert.equal(asButton(actionButton('Disconnect hub')).disabled, true);
    assert.equal(asButton(actionButton('Configure hub')).disabled, true);
    assert.equal(asButton(actionButton('Shutdown hub')).disabled, true);
    assert.equal(document.activeElement, actionButton('Remove hub'));
    assert.equal(
      window.getComputedStyle(present(actionButton('Remove hub')))
        .backgroundColor,
      hexToRgb(theme.palette.error.main)
    );
    await act(() => asHtml(actionButton('Disconnect hub')).click());
    assert.equal(actions.length, 0);
    await act(() => asHtml(actionButton('Remove hub')).click());
    assert.deepEqual(actions.pop(), ['remove', 'two']);
    actionError = new Error('Disconnect failed');
    await openHub(0);
    await act(() => asHtml(actionButton('Disconnect hub')).click());
    assert.equal(
      query(document, '[role="alert"]').textContent,
      'Disconnect failed'
    );
    actionError = null;
    let finishAction: (() => void) | undefined;
    pendingAction = new Promise<void>((resolve) => {
      finishAction = resolve;
    });
    await openHub(0);
    await act(() => asHtml(actionButton('Disconnect hub')).click());
    assert.equal(asButton(buttons[0]).disabled, true);
    assert.equal(buttons[0].getAttribute('aria-expanded'), null);
    assert.deepEqual(actions.pop(), ['disconnect', 'one']);
    await act(async () => {
      present(finishAction)();
      await pendingAction;
    });
    assert.equal(asButton(buttons[0]).disabled, false);
    await act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          ...[...unnamed.keys()].map(
            // Keep the invalid port values intact to exercise the render guard.
            (port): React.ReactElement =>
              Reflect.apply(React.createElement, React, [
                Device,
                { key: String(port), uuid: 'one', port },
              ])
          )
        )
      )
    );
    assert.equal(document.querySelectorAll('li').length, 0);
    await act(() => root.render(null));
    await act(render);
    await act(() => asHtml(query(document, 'button')).click());
    assert.equal(attempts, 1);
    assert.equal(asButton(query(document, 'button')).disabled, true);
    assert.equal(query(document, 'button').getAttribute('aria-busy'), 'true');
    assert.ok(document.querySelector('button [role="progressbar"]'));
    assert.equal(
      window.getComputedStyle(query(document, 'button')).backgroundColor,
      theme.palette.action.disabledBackground
    );
    await act(async () => {
      present(rejectConnection)(new Error('Scan cancelled'));
    });
    assert.equal(present(messages.at(-1)).text, 'Scan cancelled');
    assert.equal(present(messages.at(-1)).level, 'error');
    assert.equal(asButton(query(document, 'button')).disabled, false);
    assert.equal(
      query(document, 'button').getAttribute('aria-label'),
      'Connect hub'
    );
    assert.equal(messages.length, 1);
    await act(() => asHtml(query(document, 'button')).click());
    await act(async () => {
      present(resolveConnection)({ name: 'Train', uuid: 'one' });
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[1].text, 'Train connected');
    assert.equal(messages[1].level, 'success');
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(asButton(query(document, 'button')).disabled, false);
  } finally {
    await act(() => root.unmount());
  }
});
