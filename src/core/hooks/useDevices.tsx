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
import lego, { CONSTS } from '../clients/lego';
import type { DeviceInfo, DeviceEvents, RawDevice, RawHub } from '../types';
import type { ProjectDevice } from '../project';
import { ledCapabilities, lightSelection } from '../leds';
import type { LightChanges } from '../leds';
import logger from '../../utils/logger';
import { useHubs, useSetHubColor } from './useHubs';
import contextHook from './context-hook';
import {
  motorCommand,
  queueDeviceOperation,
  unsubscribeDeviceMode,
  type DeviceEntry,
} from './device-operations';
import runDeviceLight from './device-light-operations';

type DeviceMap = Map<string, Map<string, DeviceInfo>>;
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
  restoreProjectDevices: (
    projectDevices: readonly ProjectDevice[]
  ) => () => void;
  removeOfflineHubDevices: (uuid: string) => void;
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

// Check whether a device port has a usable name.
function hasPortName(port: string | undefined): port is string {
  return typeof port === 'string' && port.trim().length > 0;
}

// Track device sessions and expose device telemetry and commands to consumers.
export function DevicesProvider({ children }: PropsWithChildren) {
  const hubs = useHubs();
  const setHubColor = useSetHubColor();
  const hubColorAction = useRef(setHubColor);
  hubColorAction.current = setHubColor;
  const [devices, setDevices] = useState<DeviceMap>(() => new Map());
  const [error, setError] = useState<unknown>(null);
  const latest = useRef({ hubs, devices });
  latest.current = { hubs, devices };
  const lifecycle = useRef<DeviceLifecycle>({
    mounted: false,
    sessions: new Map(),
  });
  const nextConnection = useRef(0);

  // Record and log device failures while the provider remains mounted.
  const reportError = useCallback((cause: unknown) => {
    logger.error('Device action failed', cause);
    if (lifecycle.current.mounted) setError(cause);
  }, []);

  // Apply one device update immutably within its hub's port map.
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

  // Publish a device's confirmed and pending light state.
  const publishLight = useCallback(
    (session: { hub: RawHub }, entry: DeviceEntry) => {
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

  // Run a light operation using the current device session handlers.
  const runLight = useCallback(
    (
      session: DeviceSession,
      entry: DeviceEntry,
      isCurrent: () => boolean,
      input: LightChanges,
      ensureInput?: () => void,
      initial = false
    ): Promise<void> =>
      runDeviceLight({
        session,
        entry,
        isCurrent,
        input,
        ensureInput,
        initial,
        publishLight,
        setHubColor: (uuid, color, hub) =>
          hubColorAction.current(uuid, color, hub),
      }),
    [publishLight]
  );

  // Remove device listeners and optionally clean up motors and subscriptions.
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
        // Release subscribed modes after any pending device operation settles.
        const clean = async () => {
          if (
            session.connected &&
            session.hub.connected &&
            session.hub.getDeviceAtPort(entry.port) === entry.device
          ) {
            await Promise.all(
              [...entry.modes, ...(entry.lightMode ? [3] : [])].map((mode) =>
                unsubscribeDeviceMode(session.hub, entry.device, mode)
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

  // End a hub's device session and release its attached device entries.
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

    // Clear live telemetry and command state for a disconnected device.
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

    // Track a hub's attached devices and bind their hardware events.
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
      // Check whether this hub's device session is still active.
      const isCurrent = (): boolean =>
        current.mounted && current.sessions.get(uuid) === session;

      setDevices((previous) =>
        previous.has(uuid) ? previous : new Map(previous).set(uuid, new Map())
      );

      // Register an attached device and publish its initial state.
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
        // Publish sensor events only for the current device connection.
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
        logger.debug('Hub device attached', {
          hub: hub.name || 'Unnamed hub',
          port,
          hubType: hub.type,
          deviceType: device.type,
        });
        if (device.type === CONSTS.DeviceType.HUB_LED) {
          const { rgb } = lego.colorFromText(uuid);
          const color = tinycolor(rgb).toHexString();
          const capabilities = ledCapabilities(device.type, hub.type);
          if (!capabilities) throw new Error('Hub light is unavailable');
          entry.light = lightSelection(capabilities, null, { color });
          // Guard initial light setup against device replacement or detachment.
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
        logger.debug('Hub device detached', {
          hub: hub.name || 'Unnamed hub',
          port,
          hubType: hub.type,
          deviceType: device.type,
        });
        release(session, entry, false);
        session.entries.delete(port);
        markDisconnected(uuid, port);
      };
      session.end = (cleanSubscriptions: boolean) => {
        if (!isCurrent()) return;
        logger.info('Hub device inventory disconnected', {
          hub: hub.name || 'Unnamed hub',
          hubType: hub.type,
          devices: [...session.entries.values()].map(({ port, device }) => ({
            port,
            type: device.type,
          })),
        });
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
      | 'restoreProjectDevices'
      | 'removeOfflineHubDevices'
      | 'setSpeed'
      | 'setLight'
      | 'isDeviceCurrent'
      | 'subscribe'
      | 'unsubscribe'
    >
  >(() => {
    // Restore saved device metadata while preserving live device records.
    const restoreProjectDevices = (
      projectDevices: readonly ProjectDevice[]
    ) => {
      const previous = latest.current.devices;
      const restored = new Map<string, Map<string, DeviceInfo>>();
      // Add a device record to the restored hub inventory.
      const add = (device: DeviceInfo) => {
        const ports = restored.get(device.uuid) || new Map();
        ports.set(device.port, device);
        restored.set(device.uuid, ports);
      };
      projectDevices.forEach((device) =>
        add({
          ...device,
          connected: false,
          events: {},
          commands: {},
        })
      );
      lifecycle.current.sessions.forEach((session, uuid) => {
        if (!session.connected || !session.hub.connected) return;
        session.entries.forEach((entry, port) => {
          if (session.hub.getDeviceAtPort(port) !== entry.device) return;
          const info = previous.get(uuid)?.get(port);
          if (info?.connected) add(info);
        });
      });
      return () => setDevices(restored);
    };

    // Remove a saved device inventory after verifying its hub is offline.
    const removeOfflineHubDevices = (uuid: string): void => {
      const currentHubs = latest.current.hubs;
      const currentDevices = latest.current.devices;
      const hub = currentHubs.get(uuid);
      if (!hub || hub.online || lifecycle.current.sessions.has(uuid))
        throw new Error('The saved hub is no longer offline');
      const inventory = currentDevices.get(uuid);
      if ([...(inventory?.values() || [])].some((device) => device.connected))
        throw new Error('The saved hub has connected devices');
      const next = new Map(currentDevices);
      next.delete(uuid);
      setDevices(next);
    };

    // Verify that a device connection still matches the active session.
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

    // Run a device action after validating the current session and entry.
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
        // Ensure later async work still belongs to this device session.
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

    // Validate and send a motor speed command to a connected device.
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

    // Queue a device mode subscription or unsubscription.
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
          return queueDeviceOperation(entry, async () => {
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
              await unsubscribeDeviceMode(hub, device, mode);
              entry.modes.delete(mode);
              entry.requestedModes.delete(mode);
            }
            if (isCurrent()) publishLight(session, entry);
          });
        },
        connectionId
      );

    // Apply light changes to a connected device.
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
    // Subscribe to a device mode.
    const subscribe: DeviceContextValue['subscribe'] = (
      uuid,
      port,
      mode,
      connectionId
    ) => subscription(uuid, port, mode, true, connectionId);
    // Unsubscribe from a device mode.
    const unsubscribeDevice: DeviceContextValue['unsubscribe'] = (
      uuid,
      port,
      mode,
      connectionId
    ) => subscription(uuid, port, mode, false, connectionId);

    return {
      restoreProjectDevices,
      removeOfflineHubDevices,
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
export const useRestoreProjectDevices = hookFactory('restoreProjectDevices');
export const useRemoveOfflineHubDevices = hookFactory(
  'removeOfflineHubDevices'
);
// Select all device records for one hub.
export const useHubDevices = (
  uuid: string | undefined
): ReadonlyMap<string, DeviceInfo> => {
  const devices = useDevices();
  return (uuid && devices.get(uuid)) || emptyDevices;
};
// Select one device record by hub UUID and port.
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
