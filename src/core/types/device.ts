import type { Device } from 'node-poweredup/dist/devices/device.js';
import type { PositionDriver } from '../position-motor';
import type { ServoDriver } from '../virtual-servo';

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
  positionDriver?: PositionDriver;
  servoDriver?: ServoDriver;
  lightPending?: boolean;
  requestedBrightness?: number;
  lightError?: unknown;
  lightBlocked?: boolean;
};

type RawDeviceEvents = {
  rotate: (event: { degrees: number }) => void;
  distance: (event: { distance: number }) => void;
  color: (event: { color: number }) => void;
  colorAndDistance: (event: { color: number; distance: number }) => void;
  tilt: (event: { x: number; y: number; z: number }) => void;
};

type RawEventMethods<Events> = {
  on<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  once<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  removeListener<K extends keyof Events>(
    event: K,
    listener: Events[K]
  ): unknown;
};

export type RawDevice = Pick<
  Device,
  'autoSubscribe' | 'portId' | 'portName' | 'type'
> & {
  on: RawEventMethods<RawDeviceEvents>['on'];
  once: RawEventMethods<RawDeviceEvents>['once'];
  removeListener: RawEventMethods<RawDeviceEvents>['removeListener'];
  values: Record<string, unknown>;
  requestUpdate?: () => void;
  gotoAngle?: (
    angle: number,
    speed: number,
    interrupt: boolean
  ) => Promise<number> | undefined;
  rotateByDegrees?: (
    degrees: number,
    speed: number,
    interrupt: boolean
  ) => Promise<number> | undefined;
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

export type SensorTarget = {
  uuid: string;
  port: string;
  connectionId: number;
  mode: number;
};
