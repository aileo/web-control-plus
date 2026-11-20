import type { BaseHub } from 'node-poweredup/dist/hubs/basehub.js';
import type { DeviceTypeInfo, RawDevice } from './device';

type RawHubEvents = {
  attach: (device: RawDevice) => void;
  detach: (device: RawDevice) => void;
  disconnect: () => void;
};

type HubEventMethods<Events> = {
  on<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  once<K extends keyof Events>(event: K, listener: Events[K]): unknown;
  removeListener<K extends keyof Events>(
    event: K,
    listener: Events[K]
  ): unknown;
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
  on: HubEventMethods<RawHubEvents>['on'];
  once: HubEventMethods<RawHubEvents>['once'];
  removeListener: HubEventMethods<RawHubEvents>['removeListener'];
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
