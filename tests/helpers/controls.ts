import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { TestContext } from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM, type DOMWindow } from 'jsdom';
import ts from 'typescript';
import legoClient from '../../src/core/clients/lego.ts';
import type { Control, ControlOf, ControlType } from '../../src/core/types.ts';
import { present } from './dom.ts';

export function controlOf<K extends ControlType>(
  control: Control | undefined,
  type: K
): ControlOf<K> {
  assert.equal(control?.type, type, `Expected a ${type} control`);
  return control as ControlOf<K>;
}

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
// Fixture inference keeps the lookup and configured scan on the same hub type.

const connected = new Map<string, FakeHub>();
export const logs: unknown[][] = [];
export const lego = {
  ...legoClient,

  add: async (): Promise<FakeHub> => {
    throw new Error('No test hub configured');
  },
  get: ({ uuid }: { uuid: string }) => connected.get(uuid),
};
export function resetHardware() {
  logs.length = 0;
  connected.clear();
}
export const { DeviceType, HubType } = lego.CONSTS;

type SourceModules = {
  'components/Footer': typeof import('../../src/components/Footer.tsx');
  'components/modules/controls/CustomColor': typeof import('../../src/components/modules/controls/CustomColor.tsx');
  'hooks/useHubs': typeof import('../../src/hooks/useHubs.tsx');
  'hooks/useDevices': typeof import('../../src/hooks/useDevices.tsx');
  'hooks/useControls': typeof import('../../src/hooks/useControls.tsx');
  'hooks/useNavigation': typeof import('../../src/hooks/useNavigation.tsx');
  'hooks/useToast': typeof import('../../src/hooks/useToast.tsx');
  'hooks/useHelpPreference': typeof import('../../src/hooks/useHelpPreference.ts');
  'components/ToastViewport': typeof import('../../src/components/ToastViewport.tsx');
  'components/Modal': typeof import('../../src/components/Modal.tsx');
  'components/modules/grid/Grid': typeof import('../../src/components/modules/grid/Grid.tsx');
  'components/pages/Main': typeof import('../../src/components/pages/Main.tsx');
  'components/modules/controls/Distance': typeof import('../../src/components/modules/controls/Distance.tsx');
  'components/modules/controls/ControlPreview': typeof import('../../src/components/modules/controls/ControlPreview.tsx');
  'components/modules/controls/Size': typeof import('../../src/components/modules/controls/Size.tsx');
  'components/modules/controls/Arrows': typeof import('../../src/components/modules/controls/Arrows.tsx');
  'components/modules/hubs/Hub': typeof import('../../src/components/modules/hubs/Hub.tsx');
  'components/modules/hubs/Device': typeof import('../../src/components/modules/hubs/Device.tsx');
  'components/modules/hubs/HubList': typeof import('../../src/components/modules/hubs/HubList.tsx');
  'core/board-pattern': typeof import('../../src/core/board-pattern.ts');
  'core/leds': typeof import('../../src/core/leds.ts');
  'core/controlTypes': typeof import('../../src/core/controlTypes.ts');
  'core/control-layout': typeof import('../../src/core/control-layout.ts');
  'utils/deviceTypes': typeof import('../../src/utils/deviceTypes.ts');
  'theme/colors': typeof import('../../src/theme/colors.ts');
};

type LoaderOptions = {
  hooks?: object;
  globals?: Record<string, unknown>;
};
export function createSourceLoader({
  hooks,
  globals = {},
}: LoaderOptions = {}) {
  // Cache by resolved filename so components and probes share React contexts.
  const modules = new Map<string, object>();
  function evaluateSource(relative: string): object {
    const path = resolve(sourceRoot, relative);
    const file = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      resolve(path, 'index.ts'),
      resolve(path, 'index.tsx'),
    ].find((candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate));
    if (!file) throw new Error(`Missing test module: ${path}`);
    const cached = modules.get(file);
    if (cached) return cached;
    const exports = {};
    modules.set(file, exports);
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const context = {
      exports,
      console,
      URL,
      require: (id: string): unknown => {
        if (hooks && /\/hooks(?:\/index(?:\.ts)?)?$/.test(id)) return hooks;
        if (/clients\/lego(?:\.ts)?$/.test(id)) {
          return { default: lego, CONSTS: lego.CONSTS, __esModule: true };
        }
        if (/utils\/logger(?:\.ts)?$/.test(id)) {
          return {
            default: { error: (...args: unknown[]) => logs.push(args) },
            __esModule: true,
          };
        }
        if (id.startsWith('.'))
          return evaluateSource(resolve(dirname(file), id));
        // External libraries resolve in Node so VM components share React.
        // eslint-disable-next-line import/no-dynamic-require
        return require(id);
      },
    };
    for (const globalName of [
      'setTimeout',
      'clearTimeout',
      'window',
      'document',
      'HTMLElement',
      'HTMLInputElement',
      'Element',
      'Node',
      'DocumentFragment',
      'ShadowRoot',
      'ResizeObserver',
      'requestAnimationFrame',
      'Error',
    ] as const) {
      if (!Object.hasOwn(globals, globalName)) {
        Object.defineProperty(context, globalName, {
          get: () => globalThis[globalName],
        });
      }
    }
    runInNewContext(
      `(() => {\n${outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href))}\n})()`,
      Object.assign(context, globals),
      { filename: file }
    );
    return exports;
  }
  return function load<K extends keyof SourceModules>(
    relative: K
  ): SourceModules[K] {
    return evaluateSource(relative) as SourceModules[K];
  };
}
export const loadSource = createSourceLoader();

// Emotion chooses browser or server rendering when its modules first load.
// Suites load MUI components before mounting a DOM, which would select server
// mode: inline <style> tags vanish with their first owner while the cache still
// marks those rules inserted, leaving later elements unstyled.
function preloadBrowserEmotion(): import('@emotion/cache').EmotionCache {
  const { window } = new JSDOM('');
  const globals = { window, document: window.document };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    require('@emotion/utils');
    require('@emotion/use-insertion-effect-with-fallbacks');
    require('@emotion/cache');
    require('@emotion/react');
    require('@emotion/styled');
    // Browser-mode Emotion has no default cache without a DOM, and createCache
    // reads document, so server-rendered markup gets a detached cache made here
    // (insertion effects never run on the server).
    const { default: createCache } =
      require('@emotion/cache') as typeof import('@emotion/cache');
    return createCache({ key: 'static', container: window.document.head });
  } finally {
    Object.keys(globals).forEach((name) =>
      Reflect.deleteProperty(globalThis, name)
    );
    window.close();
  }
}
const staticCache = preloadBrowserEmotion();

export function staticMarkup(element: React.ReactElement): string {
  const { CacheProvider } =
    require('@emotion/react') as typeof import('@emotion/react');
  return renderToStaticMarkup(
    React.createElement(CacheProvider, { value: staticCache }, element)
  );
}
export const hubs = loadSource('hooks/useHubs');
export const devices = loadSource('hooks/useDevices');
export const controls = loadSource('hooks/useControls');
export const navigation = loadSource('hooks/useNavigation');
export const toast = loadSource('hooks/useToast');

export function fakeDevice(
  portName: string,
  type: number = DeviceType.TECHNIC_LARGE_LINEAR_MOTOR
) {
  return Object.assign(new EventEmitter(), {
    portName,
    portId: portName.charCodeAt(0),
    type,
    autoSubscribe: true,
    speeds: [] as [number, number?, boolean?][],
    powers: [] as [number, boolean?][],
    rgb: [] as number[][],
    writes: [] as [number, number[]][],
    values: {} as Record<string, Record<string, number>>,
    async setRGB(...rgb: [number, number, number]): Promise<number | void> {
      this.rgb.push(rgb);
    },
    async writeDirect(mode: number, payload: Uint8Array) {
      this.writes.push([mode, [...payload]]);
    },
    async setSpeed(...args: [number, number?, boolean?]) {
      this.speeds.push(args);
    },
    async setPower(...args: [number, boolean?]) {
      this.powers.push(args);
    },
  });
}
export type FakeDevice = ReturnType<typeof fakeDevice>;

export function fakeHub(
  uuid = 'hub-one',
  type: number = HubType.TECHNIC_MEDIUM_HUB,
  attached: Record<string, FakeDevice> = {
    A: fakeDevice('A'),
    B: fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR),
    C: fakeDevice('C', DeviceType.TILT_SENSOR),
    LED: fakeDevice('LED', DeviceType.HUB_LED),
    VOLTAGE_SENSOR: fakeDevice('VOLTAGE_SENSOR', DeviceType.VOLTAGE_SENSOR),
  }
) {
  const hub = Object.assign(new EventEmitter(), {
    uuid,
    name: 'Test hub',
    primaryMACAddress: '01:02:03:04:05:06',
    type,
    connected: true,
    connecting: false,
    devices: attached,
    ports: Object.keys(attached),
    batteryLevel: 80,
    firmwareVersion: '1.0',
    hardwareVersion: '1.0',
    rssi: -50,
    subscriptions: [] as number[][],
    unsubscriptions: [] as number[][],
    getDeviceAtPort: (port: string) => attached[port],
    getDevices: () => Object.values(attached),
    getDevicesByType: (kind: number) =>
      Object.values(attached).filter((device) => device.type === kind),
    async subscribe(...args: number[]) {
      hub.subscriptions.push(args);
    },
    async unsubscribe(...args: number[]) {
      hub.unsubscriptions.push(args);
    },
    async setName(name: string) {
      this.name = name;
    },
    async connect() {
      this.connected = true;
    },
    async disconnect() {
      this.connected = false;
      connected.delete(uuid);
      hub.emit('disconnect');
    },
    async shutdown() {
      await this.disconnect();
    },
  });
  lego.add = async () => {
    connected.set(uuid, hub);
    return hub;
  };
  return hub;
}
export type FakeHub = ReturnType<typeof fakeHub>;

interface MountOptions {
  strict?: boolean;
  render?: () => React.ReactNode;
  instructions?: boolean;
  configureWindow?: (window: DOMWindow) => void;
}

export async function mount(
  t: TestContext,
  {
    strict = false,
    render = () => null,
    instructions = false,
    configureWindow = () => {},
  }: MountOptions = {}
) {
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://localhost:8000/',
  });
  const names = [
    'window',
    'document',
    'HTMLElement',
    'HTMLInputElement',
    'Element',
    'Node',
    'DocumentFragment',
    'ShadowRoot',
    'MouseEvent',
    'KeyboardEvent',
  ] as const;
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: dom.window[name],
    });
  configureWindow(dom.window);
  const { createRoot } = await import('react-dom/client');
  const { CacheProvider } =
    require('@emotion/react') as typeof import('@emotion/react');
  const { default: createCache } =
    require('@emotion/cache') as typeof import('@emotion/cache');
  const { ThemeProvider, createTheme } =
    require('@mui/material/styles') as typeof import('@mui/material/styles');
  const ToastViewport = loadSource('components/ToastViewport').default;
  const captures = new WeakMap<HTMLElement, number>();
  dom.window.HTMLElement.prototype.setPointerCapture =
    function setPointerCapture(id) {
      captures.set(this, id);
    };
  dom.window.HTMLElement.prototype.hasPointerCapture =
    function hasPointerCapture(id) {
      return captures.get(this) === id;
    };
  dom.window.HTMLElement.prototype.releasePointerCapture =
    function releasePointerCapture() {
      captures.delete(this);
    };
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  resetHardware();
  let show = true;
  function useProbeAPI() {
    return {
      controls: controls.useControls(),
      boards: controls.useBoards(),
      selectedBoardId: controls.useSelectedBoardId(),
      activeBoards: controls.useActiveBoards(),
      addBoard: controls.useAddBoard(),
      selectBoard: controls.useSelectBoard(),
      renameBoard: controls.useRenameBoard(),
      removeBoard: controls.useRemoveBoard(),
      stopAll: controls.useStopAll(),
      error: controls.useControlsError(),
      create: controls.useAddControl(),
      update: controls.useUpdateControl(),
      remove: controls.useRemoveControl(),
      speed: controls.useSetControlSpeed(),
      light: controls.useSetControlLight(),
      deviceLight: devices.useSetDeviceLight(),
      retry: controls.useRetryControls(),
      instructions: controls.useBoardInstructions(),
      occupancy: controls.useBoardOccupancy(),
      dismissInstructions: controls.useDismissInstructions(),
      helpPreference: controls.useHelpVisibilityPreference(),
      devices: devices.useDevices(),
      hubs: hubs.useHubs(),
      hubsError: hubs.useHubsError(),
      addHub: hubs.useAddHub(),
      removeHub: hubs.useRemoveHub(),
      disconnect: hubs.useDisconnectHub(),
      refresh: hubs.useRefreshHub(),
      openModal: navigation.useOpenModal(),
      modal: navigation.useModal(),
      closeModal: navigation.useCloseModal(),
      toastMessages: toast.useToastMessages(),
    };
  }
  let api: ReturnType<typeof useProbeAPI> | undefined;
  function Probe() {
    api = useProbeAPI();
    return render();
  }
  const theme = createTheme({
    palette: loadSource('theme/colors').default,
    components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
  });
  function App() {
    return React.createElement(
      ThemeProvider,
      { theme },
      React.createElement(
        toast.ToastProvider,
        null,
        React.createElement(
          navigation.NavigationProvider,
          null,
          React.createElement(
            hubs.HubsProvider,
            null,
            React.createElement(
              devices.DevicesProvider,
              null,
              show &&
                React.createElement(
                  controls.ControlsProvider,
                  null,
                  React.createElement(Probe)
                )
            )
          )
        ),
        React.createElement(ToastViewport)
      )
    );
  }
  const root = createRoot(present(document.getElementById('root')));
  // Each fixture discards its document, so cached styles cannot outlive it.
  const cache = createCache({
    key: 'test',
    container: document.head,
    speedy: false,
  });
  let mounted = true;
  const renderRoot = () =>
    root.render(
      React.createElement(
        CacheProvider,
        { value: cache },
        strict
          ? React.createElement(
              React.StrictMode,
              null,
              React.createElement(App)
            )
          : React.createElement(App)
      )
    );
  const unmount = async () => {
    if (!mounted) return;
    await act(async () => root.unmount());
    mounted = false;
  };
  t.after(async () => {
    await unmount();
    cache.sheet.flush();
    dom.window.close();
    for (const name of names) Reflect.deleteProperty(globalThis, name);
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  await act(async () => renderRoot());
  if (!instructions) await act(async () => present(api).dismissInstructions());
  return {
    get api() {
      return present(api);
    },
    dom,
    unmount,
    async hideControls() {
      show = false;
      await act(async () => renderRoot());
    },
    async showControls() {
      show = true;
      await act(async () => renderRoot());
    },
  };
}

type ControlInput = Parameters<ReturnType<typeof controls.useAddControl>>[0];
export async function create(
  view: Awaited<ReturnType<typeof mount>>,
  type: ControlInput['type'] = 'slider',
  port = 'A',
  extra: Partial<ControlInput> = {}
) {
  let control:
    Awaited<ReturnType<ReturnType<typeof controls.useAddControl>>> | undefined;
  await act(async () => {
    control = await view.api.create({ type, uuid: 'hub-one', port, ...extra });
  });
  return present(control);
}

export async function click(element: Element) {
  if (!(element instanceof HTMLElement))
    throw new Error('Expected clickable HTML element');
  await act(async () => element.click());
}

export function visibleText(element: Element) {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('style').forEach((style) => style.remove());
  return (copy.textContent ?? '').trim();
}

export function button(text: string, parent: ParentNode = document) {
  const found = [
    ...parent.querySelectorAll(
      'button, [role="img"][aria-label^="Move "], [role="img"][aria-label^="Resize "]'
    ),
  ].find(
    (element) =>
      (element.getAttribute('aria-label') || visibleText(element)).trim() ===
      text
  );
  assert.ok(found instanceof HTMLElement, `Button not found: ${text}`);
  return found;
}

export async function input(element: Element, value: string | number) {
  if (!(
    element instanceof window.HTMLInputElement ||
    element instanceof window.HTMLSelectElement
  )) {
    throw new Error('Expected input or select');
  }
  const prototype =
    element.tagName === 'SELECT'
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  present(Object.getOwnPropertyDescriptor(prototype, 'value')?.set).call(
    element,
    String(value)
  );
  await act(async () =>
    element.dispatchEvent(
      new window.Event(
        element.tagName === 'SELECT' || element.type === 'range'
          ? 'change'
          : 'input',
        { bubbles: true }
      )
    )
  );
}

type PointerOptions = MouseEventInit &
  Pick<PointerEventInit, 'pointerId' | 'pointerType' | 'isPrimary'>;
export async function pointer(
  element: EventTarget,
  type: string,
  data: PointerOptions = {}
) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...data,
  });
  Object.defineProperties(event, {
    pointerId: { value: data.pointerId ?? 1 },
    pointerType: { value: data.pointerType || 'mouse' },
    isPrimary: { value: data.isPrimary ?? true },
  });
  await act(async () => element.dispatchEvent(event));
}

export async function key(
  element: EventTarget,
  type: string,
  value: string,
  options: KeyboardEventInit = {}
) {
  await act(async () =>
    element.dispatchEvent(
      new window.KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: value,
        ...options,
      })
    )
  );
}
