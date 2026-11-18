import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import tinycolor from 'tinycolor2';
import lego, { CONSTS } from '../core/clients/lego';
import type {
  DeviceInfo,
  DeviceEvents,
  LightSelection,
  RawDevice,
  RawHub,
} from '../core/types';
import { ledCapabilities, lightSelection, writeLight } from '../core/leds';
import type { LightChanges } from '../core/leds';
import logger from '../utils/logger';
import { useHubs, useSetHubColor } from './useHubs';
import contextHook from './contextHook';

type DeviceMap = Map<string, Map<string, DeviceInfo>>;
type LightRequest = { changes: LightChanges; guard?: () => void };
type DeviceEntry = {
  device: RawDevice;
  port: string;
  modes: Set<number>;
  requestedModes: Set<number>;
  connectionId: number;
  commandVersion: number;
  motorActive: boolean;
  listeners?: {
    distance: (event: { distance: number }) => void;
    color: (event: { color: number }) => void;
    colorAndDistance: (event: { color: number; distance: number }) => void;
    tilt: (event: { x: number; y: number; z: number }) => void;
  };
  light?: LightSelection;
  lightPending: number;
  lightError: unknown;
  lightMode: boolean;
  queuedBrightness: { request: LightRequest; pending: Promise<void> } | null;
  brightnessIntent: LightRequest | null;
  pendingOperation: Promise<void> | null;
};
type DeviceSession = {
  hub: RawHub;
  entries: Map<string, DeviceEntry>;
  connected: boolean;
  onAttach: (device: RawDevice) => void;
  onDetach: (device: RawDevice) => void;
  onDisconnect: () => void;
  end: (cleanSubscriptions: boolean) => void;
};
type DeviceLifecycle = {
  mounted: boolean;
  sessions: Map<string, DeviceSession>;
};
type DeviceContextValue = {
  devices: DeviceMap;
  error: unknown;
  setSpeed: (
    uuid: string,
    port: string,
    speed: number,
    connectionId?: number
  ) => Promise<void>;
  setLight: (
    uuid: string,
    port: string,
    changes: LightChanges,
    connectionId?: number,
    guard?: () => void
  ) => Promise<void>;
  isDeviceCurrent: (
    uuid: string,
    port: string,
    connectionId?: number
  ) => boolean;
  subscribe: (
    uuid: string,
    port: string,
    mode: number,
    connectionId?: number
  ) => Promise<void>;
  unsubscribe: (
    uuid: string,
    port: string,
    mode: number,
    connectionId?: number
  ) => Promise<void>;
};

const devicesContext = createContext<DeviceContextValue | null>(null);
const emptyDevices: ReadonlyMap<string, DeviceInfo> = new Map();
const systemTypes = [
  CONSTS.DeviceType.HUB_LED,
  CONSTS.DeviceType.VOLTAGE_SENSOR,
  CONSTS.DeviceType.CURRENT_SENSOR,
];

function hasPortName(port: string | undefined): port is string {
  return typeof port === 'string' && port.trim().length > 0;
}

function unsubscribe(
  hub: RawHub,
  device: RawDevice,
  mode: number
): Promise<void> | void {
  // WeDo includes device type; LPF2 identifies a mode with two arguments.
  return hub.type === CONSTS.HubType.WEDO2_SMART_HUB
    ? hub.unsubscribe(device.portId, device.type, mode)
    : hub.unsubscribe(device.portId, mode);
}

function motorCommand(
  hub: RawHub,
  device: RawDevice
): (speed: number) => Promise<number | void> | number | void {
  if (
    typeof device.setSpeed === 'function' &&
    hub.type !== CONSTS.HubType.WEDO2_SMART_HUB
  ) {
    const { setSpeed } = device;
    return (speed) => setSpeed.call(device, speed, undefined, true);
  }
  if (typeof device.setPower === 'function') {
    const { setPower } = device;
    return (speed) => setPower.call(device, speed, true);
  }
  throw new Error('Device does not support motor speed');
}

function queueOperation(
  entry: DeviceEntry,
  operation: () => Promise<void> | void
): Promise<void> {
  // Keep mode changes and light writes ordered for this physical output.
  // Any intervening operation is a barrier to brightness coalescing.
  entry.queuedBrightness = null;
  const pending = (entry.pendingOperation || Promise.resolve()).then(
    operation,
    operation
  );
  entry.pendingOperation = pending;
  const clean = () => {
    if (entry.pendingOperation === pending) entry.pendingOperation = null;
  };
  pending.then(clean, clean);
  return pending;
}

export function DevicesProvider({ children }: PropsWithChildren) {
  const hubs = useHubs();
  const setHubColor = useSetHubColor();
  const hubColorAction = useRef(setHubColor);
  hubColorAction.current = setHubColor;
  const [devices, setDevices] = useState<DeviceMap>(() => new Map());
  const [error, setError] = useState<unknown>(null);
  const lifecycle = useRef<DeviceLifecycle>({
    mounted: false,
    sessions: new Map(),
  });
  const nextConnection = useRef(0);

  const reportError = useCallback((cause: unknown) => {
    logger.error('Device action failed', cause);
    if (lifecycle.current.mounted) setError(cause);
  }, []);

  const updateDevice = useCallback(
    (
      uuid: string,
      port: string,
      update: (previous: DeviceInfo | undefined) => DeviceInfo | undefined
    ) => {
      setDevices((previous) => {
        const ports = new Map(previous.get(uuid));
        const next = update(ports.get(port));
        if (next) ports.set(port, next);
        else ports.delete(port);
        return new Map(previous).set(uuid, ports);
      });
    },
    []
  );

  const publishLight = useCallback(
    (session: DeviceSession, entry: DeviceEntry) => {
      const capabilities = ledCapabilities(entry.device.type, session.hub.type);
      if (!capabilities) return;
      updateDevice(session.hub.uuid, entry.port, (previous) =>
        previous
          ? {
              ...previous,
              commands: {
                ...previous.commands,
                ...(entry.light ? { light: entry.light } : {}),
              },
              lightPending: entry.lightPending > 0,
              requestedBrightness: entry.brightnessIntent?.changes.brightness,
              lightError: entry.lightError,
              lightBlocked: Boolean(
                capabilities.mode !== undefined &&
                [...entry.requestedModes, ...entry.modes].some(
                  (mode) => mode !== capabilities.mode
                )
              ),
            }
          : undefined
      );
    },
    [updateDevice]
  );

  const runLight = useCallback(
    (
      session: DeviceSession,
      entry: DeviceEntry,
      isCurrent: () => boolean,
      input: LightChanges,
      ensureInput?: () => void,
      initial = false
    ): Promise<void> => {
      const step = ledCapabilities(entry.device.type, session.hub.type)?.step;
      const brightness = input?.brightness;
      const continuous = Boolean(
        step &&
        typeof brightness === 'number' &&
        Number.isInteger(brightness) &&
        brightness >= 0 &&
        brightness <= 100 &&
        brightness % step === 0 &&
        input.on === Boolean(brightness) &&
        Object.keys(input).every((key) => key === 'on' || key === 'brightness')
      );
      // Only unsent brightness inputs can merge; callers share the final write.
      if (continuous && entry.queuedBrightness) {
        const { request, pending } = entry.queuedBrightness;
        request.changes = input;
        request.guard = ensureInput;
        entry.lightError = null;
        publishLight(session, entry);
        return pending;
      }
      const request: LightRequest = { changes: input, guard: ensureInput };
      // Show requested brightness without marking it as confirmed.
      if (continuous) entry.brightnessIntent = request;
      entry.lightPending += 1;
      entry.lightError = null;
      publishLight(session, entry);
      const pending = queueOperation(entry, async () => {
        if (entry.queuedBrightness?.request === request)
          entry.queuedBrightness = null;
        const { changes, guard } = request;
        try {
          if (!isCurrent()) throw new Error('Light connection changed');
          guard?.();
          const capabilities = ledCapabilities(
            entry.device.type,
            session.hub.type
          );
          if (!capabilities) throw new Error('Device does not support lights');
          const next = lightSelection(
            capabilities,
            entry.light ?? null,
            changes
          );
          if (
            capabilities.mode !== undefined &&
            [...entry.requestedModes, ...entry.modes].some(
              (mode) => mode !== capabilities.mode
            )
          )
            throw new Error('Light is managed by an active sensor control');
          if (
            next.on !== null &&
            (next.on ||
              Object.hasOwn(changes, 'on') ||
              changes.brightness === 0)
          ) {
            if (capabilities.mode !== undefined && !entry.lightMode) {
              entry.lightMode = true;
              await session.hub.subscribe(
                entry.device.portId,
                entry.device.type,
                capabilities.mode
              );
              if (!isCurrent()) throw new Error('Light connection changed');
              guard?.();
              if (entry.requestedModes.size)
                throw new Error('Light is managed by an active sensor control');
            }
            await writeLight(entry.device, entry.device.type, next);
          }
          if (!isCurrent()) throw new Error('Light connection changed');
          if (
            entry.device.type === CONSTS.DeviceType.HUB_LED &&
            Object.hasOwn(changes, 'color')
          ) {
            if (typeof next.color !== 'string')
              throw new Error('Hub light requires an RGB color');
            await hubColorAction.current(
              session.hub.uuid,
              initial ? lego.colorFromText(session.hub.uuid).hex : next.color,
              session.hub
            );
          }
          entry.light = next;
          entry.lightError = null;
        } catch (cause) {
          if (isCurrent()) entry.lightError = cause;
          throw cause;
        } finally {
          entry.lightPending -= 1;
          if (entry.brightnessIntent === request) entry.brightnessIntent = null;
          if (isCurrent()) publishLight(session, entry);
        }
      });
      if (continuous) entry.queuedBrightness = { request, pending };
      return pending;
    },
    [publishLight]
  );

  const release = useCallback(
    (
      session: DeviceSession,
      entry: DeviceEntry,
      cleanSubscriptions: boolean
    ) => {
      if (entry.listeners) {
        entry.device.removeListener('distance', entry.listeners.distance);
        entry.device.removeListener('color', entry.listeners.color);
        entry.device.removeListener(
          'colorAndDistance',
          entry.listeners.colorAndDistance
        );
        entry.device.removeListener('tilt', entry.listeners.tilt);
      }
      if (cleanSubscriptions) {
        if (
          entry.motorActive &&
          session.hub.connected &&
          session.hub.getDeviceAtPort(entry.port) === entry.device
        ) {
          // Start the stop before parent-provider teardown invalidates actions.
          try {
            Promise.resolve(motorCommand(session.hub, entry.device)(0)).catch(
              reportError
            );
          } catch (cause) {
            reportError(cause);
          }
        }
        const clean = async () => {
          if (
            session.connected &&
            session.hub.connected &&
            session.hub.getDeviceAtPort(entry.port) === entry.device
          ) {
            await Promise.all(
              [...entry.modes, ...(entry.lightMode ? [3] : [])].map((mode) =>
                unsubscribe(session.hub, entry.device, mode)
              )
            );
          }
          entry.modes.clear();
        };
        // A failed pending action is reported by execute; still clean up.
        (entry.pendingOperation || Promise.resolve())
          .then(clean, clean)
          .catch(reportError);
      } else {
        entry.modes.clear();
      }
    },
    [reportError]
  );

  const stop = useCallback(
    (session: DeviceSession, cleanSubscriptions: boolean) => {
      const { hub } = session;
      hub.removeListener('attach', session.onAttach);
      hub.removeListener('detach', session.onDetach);
      hub.removeListener('disconnect', session.onDisconnect);
      session.entries.forEach((entry) =>
        release(session, entry, cleanSubscriptions)
      );
      session.entries.clear();
    },
    [release]
  );

  useEffect(() => {
    const current: DeviceLifecycle = {
      mounted: true,
      sessions: new Map(),
    };
    lifecycle.current = current;
    return () => {
      current.mounted = false;
      current.sessions.forEach((session) => stop(session, true));
      current.sessions.clear();
    };
  }, [stop]);

  useEffect(() => {
    const { current } = lifecycle;

    function markDisconnected(uuid: string, port: string): void {
      updateDevice(uuid, port, (previous) =>
        previous
          ? {
              ...previous,
              connected: false,
              events: {},
              commands: {},
            }
          : undefined
      );
    }

    function start(hub: RawHub): void {
      const { uuid } = hub;
      const session: DeviceSession = {
        hub,
        entries: new Map(),
        connected: true,
        onAttach: () => undefined,
        onDetach: () => undefined,
        onDisconnect: () => undefined,
        end: () => undefined,
      };
      const isCurrent = (): boolean =>
        current.mounted && current.sessions.get(uuid) === session;

      function attach(device: RawDevice): void {
        if (!isCurrent()) return;
        const port = device.portName;
        if (!hasPortName(port)) return;
        const existing = session.entries.get(port);
        if (existing?.device === device) return;
        if (existing) release(session, existing, false);
        nextConnection.current += 1;
        const entry: DeviceEntry = {
          device,
          port,
          modes: new Set(),
          requestedModes: new Set(),
          connectionId: nextConnection.current,
          commandVersion: 0,
          motorActive: false,
          lightPending: 0,
          lightError: null,
          lightMode: false,
          queuedBrightness: null,
          brightnessIntent: null,
          pendingOperation: null,
        };
        const record = (events: DeviceEvents): void => {
          if (!isCurrent() || session.entries.get(port) !== entry) return;
          updateDevice(uuid, port, (previous) =>
            previous
              ? { ...previous, events: { ...previous.events, ...events } }
              : undefined
          );
        };
        entry.listeners = {
          distance: ({ distance }) => record({ distance: [distance] }),
          color: ({ color }) => record({ color: [color] }),
          colorAndDistance: ({ color, distance }) =>
            record({ color: [color], distance: [distance] }),
          tilt: ({ x, y, z }) => record({ tilt: [x, y, z] }),
        };
        if (!systemTypes.includes(device.type)) device.autoSubscribe = false;
        if (entry.listeners) {
          device.on('distance', entry.listeners.distance);
          device.on('color', entry.listeners.color);
          device.on('colorAndDistance', entry.listeners.colorAndDistance);
          device.on('tilt', entry.listeners.tilt);
        }
        session.entries.set(port, entry);
        updateDevice(uuid, port, () => ({
          uuid,
          mac: lego.identity(hub),
          port,
          hubType: hub.type,
          connectionId: entry.connectionId,
          type: lego.constToObject('DeviceType', device.type),
          connected: true,
          events: {},
          commands: {},
        }));
        if (device.type === CONSTS.DeviceType.HUB_LED) {
          const { rgb } = lego.colorFromText(uuid);
          const color = tinycolor(rgb).toHexString();
          const capabilities = ledCapabilities(device.type, hub.type);
          if (!capabilities) throw new Error('Hub light is unavailable');
          entry.light = lightSelection(capabilities, null, { color });
          const currentDevice = () =>
            isCurrent() &&
            hub.connected &&
            session.entries.get(port) === entry &&
            hub.getDeviceAtPort(port) === device;
          runLight(
            session,
            entry,
            currentDevice,
            { on: true, color },
            undefined,
            true
          ).catch(reportError);
        }
      }

      session.onAttach = (device: RawDevice) => {
        try {
          attach(device);
        } catch (cause) {
          reportError(cause);
        }
      };
      session.onDetach = (device: RawDevice) => {
        if (!isCurrent()) return;
        const port = device.portName;
        if (!port) return;
        const entry = session.entries.get(port);
        if (entry?.device !== device) return;
        release(session, entry, false);
        session.entries.delete(port);
        markDisconnected(uuid, port);
      };
      session.end = (cleanSubscriptions: boolean) => {
        if (!isCurrent()) return;
        session.connected = cleanSubscriptions;
        stop(session, cleanSubscriptions);
        current.sessions.delete(uuid);
        setDevices((previous) => {
          const ports = new Map(
            [...(previous.get(uuid) || [])].map(([port, info]) => [
              port,
              { ...info, connected: false, events: {}, commands: {} },
            ])
          );
          return new Map(previous).set(uuid, ports);
        });
      };
      session.onDisconnect = () => session.end(false);
      current.sessions.set(uuid, session);
      hub.on('attach', session.onAttach);
      hub.on('detach', session.onDetach);
      hub.on('disconnect', session.onDisconnect);
      hub.ports.forEach((port) => {
        if (!hasPortName(port)) return;
        updateDevice(uuid, port, (previous) => ({
          uuid,
          mac: lego.identity(hub),
          port,
          type: previous?.type || lego.constToObject('DeviceType', 0),
          connected: false,
          events: {},
          commands: {},
        }));
      });
      hub.getDevices().forEach(session.onAttach);
    }

    current.sessions.forEach((session, uuid) => {
      const info = hubs.get(uuid);
      if (!info?.online) session.onDisconnect();
      else if (lego.get({ uuid }) !== session.hub) {
        session.end(true);
      }
    });
    hubs.forEach((info, uuid) => {
      if (!info.online || current.sessions.has(uuid)) return;
      const hub = lego.get({ uuid });
      if (!hub) {
        reportError(new Error(`Hub not connected: ${uuid}`));
        return;
      }
      start(hub);
    });
    setDevices((previous) => {
      if ([...previous.keys()].every((uuid) => hubs.has(uuid))) return previous;
      return new Map([...previous].filter(([uuid]) => hubs.has(uuid)));
    });
  }, [hubs, release, reportError, stop, updateDevice, runLight]);

  const actions = useMemo<
    Pick<
      DeviceContextValue,
      'setSpeed' | 'setLight' | 'isDeviceCurrent' | 'subscribe' | 'unsubscribe'
    >
  >(() => {
    function isDeviceCurrent(
      uuid: string,
      port: string,
      connectionId?: number
    ): boolean {
      const session = lifecycle.current.sessions.get(uuid);
      const entry = session?.entries.get(port);
      return Boolean(
        lifecycle.current.mounted &&
        session?.hub.connected &&
        entry &&
        (connectionId === undefined || entry.connectionId === connectionId) &&
        session.hub.getDeviceAtPort(port) === entry.device
      );
    }

    async function execute<T>(
      uuid: string,
      port: string,
      action: (
        session: DeviceSession,
        entry: DeviceEntry,
        isCurrent: () => boolean
      ) => Promise<T> | T,
      connectionId?: number
    ): Promise<T> {
      try {
        if (!lifecycle.current.mounted) {
          throw new Error('DevicesProvider is not mounted');
        }
        setError(null);
        const session = lifecycle.current.sessions.get(uuid);
        const entry = session?.entries.get(port);
        if (!session || !entry || !isDeviceCurrent(uuid, port, connectionId)) {
          throw new Error(`Device not connected: ${uuid}/${port}`);
        }
        const isCurrent = (): boolean =>
          lifecycle.current.mounted &&
          lifecycle.current.sessions.get(uuid) === session &&
          session.entries.get(port) === entry &&
          isDeviceCurrent(uuid, port, entry.connectionId);
        return await action(session, entry, isCurrent);
      } catch (cause) {
        reportError(cause);
        throw cause;
      }
    }

    const setSpeed: DeviceContextValue['setSpeed'] = (
      uuid,
      port,
      speed,
      connectionId
    ) =>
      execute(
        uuid,
        port,
        async (session, entry, isCurrent) => {
          const value = Number(speed);
          if (!Number.isFinite(value) || value < -100 || value > 100) {
            throw new Error('Invalid motor speed');
          }
          const command = motorCommand(session.hub, entry.device);
          entry.commandVersion += 1;
          const version = entry.commandVersion;
          if (value !== 0) entry.motorActive = true;
          await command(value);
          if (isCurrent() && version === entry.commandVersion) {
            if (value === 0) entry.motorActive = false;
            updateDevice(uuid, port, (previous) =>
              previous
                ? {
                    ...previous,
                    commands: { ...previous.commands, speed: value },
                  }
                : undefined
            );
          }
        },
        connectionId
      );

    const subscription = (
      uuid: string,
      port: string,
      mode: number,
      subscribing: boolean,
      connectionId?: number
    ): Promise<void> =>
      execute(
        uuid,
        port,
        async (session, entry, isCurrent) => {
          const { hub } = session;
          const { device } = entry;
          if (systemTypes.includes(device.type)) {
            throw new Error('System device subscriptions are managed by hubs');
          }
          if (!Number.isInteger(mode) || mode < 0 || mode > 255) {
            throw new Error('Invalid device mode');
          }
          if (subscribing) entry.requestedModes.add(mode);
          publishLight(session, entry);
          return queueOperation(entry, async () => {
            if (!isCurrent())
              throw new Error(`Device not connected: ${uuid}/${port}`);
            if (subscribing) {
              if (entry.modes.has(mode)) return;
              await hub.subscribe(device.portId, device.type, mode);
              entry.modes.add(mode);
              entry.lightMode = false;
              if (
                entry.light &&
                ledCapabilities(device.type, hub.type)?.mode !== undefined
              )
                entry.light = { ...entry.light, on: null };
            } else {
              await unsubscribe(hub, device, mode);
              entry.modes.delete(mode);
              entry.requestedModes.delete(mode);
            }
            if (isCurrent()) publishLight(session, entry);
          });
        },
        connectionId
      );

    const setLight: DeviceContextValue['setLight'] = (
      uuid,
      port,
      changes,
      connectionId,
      guard
    ) =>
      execute(
        uuid,
        port,
        (session, entry, isCurrent) =>
          runLight(session, entry, isCurrent, changes, guard),
        connectionId
      );
    const subscribe: DeviceContextValue['subscribe'] = (
      uuid,
      port,
      mode,
      connectionId
    ) => subscription(uuid, port, mode, true, connectionId);
    const unsubscribeDevice: DeviceContextValue['unsubscribe'] = (
      uuid,
      port,
      mode,
      connectionId
    ) => subscription(uuid, port, mode, false, connectionId);

    return {
      setSpeed,
      setLight,
      isDeviceCurrent,
      subscribe,
      unsubscribe: unsubscribeDevice,
    };
  }, [reportError, updateDevice, publishLight, runLight]);

  const value = useMemo(
    (): DeviceContextValue => ({ devices, error, ...actions }),
    [devices, error, actions]
  );
  return (
    <devicesContext.Provider value={value}>{children}</devicesContext.Provider>
  );
}

const hookFactory = contextHook(
  devicesContext,
  'Device hooks must be used within a DevicesProvider'
);

export const useDevices = hookFactory('devices');
export const useHubDevices = (
  uuid: string | undefined
): ReadonlyMap<string, DeviceInfo> => {
  const devices = useDevices();
  return (uuid && devices.get(uuid)) || emptyDevices;
};
export const useDevice = (
  uuid: string | undefined,
  port: string | undefined
): DeviceInfo | undefined => {
  const devices = useHubDevices(uuid);
  return port ? devices.get(port) : undefined;
};
export const useDevicesError = hookFactory('error');
export const useSetDeviceSpeed = hookFactory('setSpeed');
export const useSetDeviceLight = hookFactory('setLight');
export const useSubscribeDevice = hookFactory('subscribe');
export const useUnsubscribeDevice = hookFactory('unsubscribe');
export const useIsDeviceCurrent = hookFactory('isDeviceCurrent');
