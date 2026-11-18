import type { Device } from 'node-poweredup/dist/devices/device.js';
import type { BaseHub } from 'node-poweredup/dist/hubs/basehub.js';

export type LightControlType =
  'brightness' | 'power' | 'palette' | 'customColor';
export type ControlType =
  | 'slider'
  | 'arrows'
  | 'stop'
  | 'distance'
  | 'color'
  | 'tilt'
  | LightControlType;

export type Size = { w: number; h: number };
export type Rect = Size & { x: number; y: number };
export type BoardOccupant = Rect & { id: string };

type ShortcutKey = string;
type RawDeviceEvents = {
  distance: (event: { distance: number }) => void;
  color: (event: { color: number }) => void;
  colorAndDistance: (event: { color: number; distance: number }) => void;
  tilt: (event: { x: number; y: number; z: number }) => void;
};
type RawHubEvents = {
  attach: (device: RawDevice) => void;
  detach: (device: RawDevice) => void;
  disconnect: () => void;
};
type RawEventMethods<Events> = {
  on<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  once<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  removeListener<K extends keyof Events>(
    event: K,
    listener: Events[K]
  ): unknown;
};
type ControlBase<K extends ControlType, Options> = Rect & {
  id: string;
  uuid: string;
  port: string;
  title: string;
  type: K;
  options: Options;
};

export type ControlOptions = {
  slider: {
    resetOnRelease: boolean;
    reverseRotation: boolean;
    increase10Key: ShortcutKey;
    increase1Key: ShortcutKey;
    decrease1Key: ShortcutKey;
    decrease10Key: ShortcutKey;
  };
  arrows: {
    speed: number;
    stopOnRelease: boolean;
    forwardKey: ShortcutKey;
    stopKey: ShortcutKey;
    backwardKey: ShortcutKey;
  };
  stop: { stopKey: ShortcutKey };
  distance: { scale: 'progressive' | 'linear' };
  color: { stability: 0 | 150 | 400 };
  tilt: {
    rollAxis: 0 | 1 | 2;
    pitchAxis: 0 | 1 | 2;
    rollReverseFactor: 1 | -1;
    pitchReverseFactor: 1 | -1;
  };
  brightness: Record<string, never>;
  power: { onKey: ShortcutKey; offKey: ShortcutKey };
  palette: Record<string, never>;
  customColor: Record<string, never>;
};

export type ControlOf<K extends ControlType> = ControlBase<
  K,
  ControlOptions[K]
>;

export type Control = { [K in ControlType]: ControlOf<K> }[ControlType];

export type Board = {
  id: string;
  name: string;
  controlIds: string[];
};

export type DeviceTypeInfo = {
  num: number;
  text: string;
  compact: string;
};

export type DeviceEvents = {
  distance?: number[];
  color?: number[];
  tilt?: number[];
};

export type LightSelection = {
  on: boolean | null;
  color: string | number;
  brightness: number;
  lastBrightness: number;
};

export type DeviceCommands = {
  speed?: number;
  light?: LightSelection;
};

export type DeviceInfo = {
  uuid: string;
  mac: string;
  port: string;
  hubType?: number;
  connectionId?: number;
  type: DeviceTypeInfo;
  connected: boolean;
  events: DeviceEvents;
  commands: DeviceCommands;
  lightPending?: boolean;
  requestedBrightness?: number;
  lightError?: unknown;
  lightBlocked?: boolean;
};

export type HubSystemInfo = {
  firmware?: string;
  batteryLevel?: number;
  current?: number;
  voltage?: number;
  rssi?: number;
};

export type HubInfo = {
  uuid: string;
  connectionOrder: number;
  name: string;
  mac: string;
  online: boolean;
  type: DeviceTypeInfo;
  color: string;
  system: HubSystemInfo;
};

export type ModalContextMap = {
  hubConfig: { uuid: string };
  controlConfig: { id: string };
  createControl: { uuid: string; port: string; returnFocusId?: string };
  boardHelp: { returnFocusId?: string } | undefined;
};

export type ModalState =
  | { name: null; context: null }
  | {
      [K in keyof ModalContextMap]: {
        name: K;
        context: ModalContextMap[K];
      };
    }[keyof ModalContextMap];

export type RawDevice = Pick<
  Device,
  'autoSubscribe' | 'portId' | 'portName' | 'type'
> & {
  on: RawEventMethods<RawDeviceEvents>['on'];
  once: RawEventMethods<RawDeviceEvents>['once'];
  removeListener: RawEventMethods<RawDeviceEvents>['removeListener'];
  values: Record<string, unknown>;
  writeDirect: (
    mode: number,
    data: Buffer,
    interrupt?: boolean
  ) => Promise<number | void> | number | void | undefined;
  setRGB?: (
    red: number,
    green: number,
    blue: number
  ) => Promise<number | void> | number | void | undefined;
  setSpeed?: (
    speed: number,
    maxPower?: number,
    interrupt?: boolean
  ) => Promise<number | void> | number | void | undefined;
  setPower?: (
    power: number,
    interrupt?: boolean
  ) => Promise<number | void> | number | void | undefined;
};

export type LightOutputDevice = Pick<RawDevice, 'writeDirect' | 'setRGB'>;

export type RawHub = Pick<
  BaseHub,
  | 'uuid'
  | 'name'
  | 'connected'
  | 'connecting'
  | 'type'
  | 'ports'
  | 'firmwareVersion'
  | 'hardwareVersion'
  | 'primaryMACAddress'
  | 'batteryLevel'
  | 'rssi'
  | 'connect'
  | 'disconnect'
> & {
  on: RawEventMethods<RawHubEvents>['on'];
  once: RawEventMethods<RawHubEvents>['once'];
  removeListener: RawEventMethods<RawHubEvents>['removeListener'];
  getDeviceAtPort(portName: string): RawDevice | undefined;
  getDevices(): RawDevice[];
  subscribe: (
    portId: number,
    deviceType: number,
    mode: number
  ) => Promise<void> | void;
  unsubscribe: (
    portId: number,
    deviceType: number,
    mode?: number
  ) => Promise<void> | void;
  setName?: (name: string) => Promise<void>;
  shutdown?: () => Promise<void>;
};

export type SensorTarget = {
  uuid: string;
  port: string;
  connectionId: number;
  mode: number;
};
