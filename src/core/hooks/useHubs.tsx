import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import lego, { CONSTS } from '../clients/lego';
import type { HubInfo, RawDevice, RawHub } from '../types';
import type { ProjectHub } from '../project';
import logger from '../../utils/logger';
import contextHook from './context-hook';

type HubSession = {
  hub: RawHub;
  sensors: Map<number, RawDevice>;
  connectionOrder: number;
  color: string;
  timer?: ReturnType<typeof setTimeout>;
  onAttach: (device: RawDevice) => void;
  onDetach: (device: RawDevice) => void;
  onDisconnect: () => void;
};

type HubLifecycle = {
  mounted: boolean;
  connecting: boolean;
  sessions: Map<string, HubSession>;
  connectionOrder: number;
};

type HubContextValue = {
  hubs: Map<string, HubInfo>;
  error: unknown;
  connecting: boolean;
  restoreProjectHubs: (projectHubs: readonly ProjectHub[]) => () => void;
  addHub: () => Promise<RawHub>;
  replaceOfflineHub: (oldUuid: string, newUuid: string) => void;
  refreshHub: (uuid: string) => Promise<void>;
  renameHub: (uuid: string, name: string) => Promise<void>;
  removeHub: (uuid: string) => Promise<void>;
  disconnectHub: (uuid: string) => Promise<void>;
  shutdownHub: (uuid: string) => Promise<void>;
  setHubColor: (
    uuid: string,
    color: string,
    expectedHub: object
  ) => Promise<void>;
};

const hubsContext = createContext<HubContextValue | null>(null);

// Read a numeric system metric from a hub sensor's values.
function readMetric(
  device: RawDevice | undefined,
  metric: 'current' | 'voltage'
) {
  if (!device) return undefined;
  const { values } = device;
  if (!values || typeof values !== 'object') return undefined;
  const sample = (values as Record<string, unknown>)[metric];
  if (!sample || typeof sample !== 'object') return undefined;
  const reading = (sample as Record<string, unknown>)[metric];
  return typeof reading === 'number' ? reading : undefined;
}

// Build the public hub record from a connection and its session state.
function hubInfo(hub: RawHub, session: HubSession): HubInfo {
  const voltage = hub.getDeviceAtPort('VOLTAGE_SENSOR');
  const current = hub.getDeviceAtPort('CURRENT_SENSOR');
  return {
    uuid: hub.uuid,
    connectionOrder: session.connectionOrder,
    name: hub.name,
    mac: lego.identity(hub),
    online: true,
    type: lego.constToObject('HubType', hub.type),
    color: session.color,
    system: {
      firmware: hub.firmwareVersion,
      batteryLevel: hub.batteryLevel,
      current: readMetric(current, 'current'),
      voltage: readMetric(voltage, 'voltage'),
      rssi: hub.rssi,
    },
  };
}

// Manage hub connections and expose their state and actions to descendants.
export function HubsProvider({ children }: PropsWithChildren) {
  const [hubs, setHubs] = useState<Map<string, HubInfo>>(() => new Map());
  const [error, setError] = useState<unknown>(null);
  const [connecting, setConnecting] = useState(false);
  const lifecycle = useRef<HubLifecycle>({
    mounted: false,
    connecting: false,
    sessions: new Map(),
    connectionOrder: 0,
  });

  // Record and log errors while the provider remains mounted.
  const reportError = useCallback((cause: unknown) => {
    logger.error('Hub action failed', cause);
    if (lifecycle.current.mounted) setError(cause);
  }, []);

  // Remove hub listeners and release the provider's sensor subscriptions.
  const stop = useCallback(
    (session: HubSession) => {
      if (session.timer) clearTimeout(session.timer);
      session.hub.removeListener('attach', session.onAttach);
      session.hub.removeListener('detach', session.onDetach);
      session.hub.removeListener('disconnect', session.onDisconnect);
      session.sensors.forEach((device) => {
        const unsubscribe =
          session.hub.type === CONSTS.HubType.WEDO2_SMART_HUB
            ? session.hub.unsubscribe(device.portId, device.type, 0)
            : session.hub.unsubscribe(device.portId, 0);
        Promise.resolve(unsubscribe).catch(reportError);
      });
      session.sensors.clear();
    },
    [reportError]
  );

  useEffect(() => {
    const { current } = lifecycle;
    current.mounted = true;
    return () => {
      current.mounted = false;
      current.sessions.forEach(stop);
      current.sessions.clear();
    };
  }, [stop]);

  const value = useMemo<HubContextValue>(() => {
    // Return the active hub session or report that the hub is disconnected.
    function getSession(uuid: string): HubSession {
      const session = lifecycle.current.sessions.get(uuid);
      if (!session) throw new Error(`Hub not connected: ${uuid}`);
      return session;
    }

    // Publish the current live metadata for a hub.
    function publish(hub: RawHub): void {
      const info = hubInfo(hub, getSession(hub.uuid));
      setHubs((previous) => new Map(previous).set(hub.uuid, info));
    }

    // Mark a known hub offline without removing its saved metadata.
    function markOffline(uuid: string): void {
      setHubs((previous) => {
        if (!previous.has(uuid)) return previous;
        const next = new Map(previous);
        const info = previous.get(uuid);
        if (info) next.set(uuid, { ...info, online: false });
        return next;
      });
    }

    // Run a hub action with lifecycle checks and consistent error reporting.
    async function execute<T>(
      action: () => Promise<T> | T,
      clearError = true
    ): Promise<T> {
      try {
        if (!lifecycle.current.mounted) {
          throw new Error('HubsProvider is not mounted');
        }
        if (clearError) setError(null);
        return await action();
      } catch (cause) {
        reportError(cause);
        throw cause;
      }
    }

    // Subscribe to a connected hub and start tracking its system sensors.
    function start(hub: RawHub, current: HubLifecycle): void {
      const existing = current.sessions.get(hub.uuid);
      if (existing) stop(existing);
      current.connectionOrder += 1;
      const session: HubSession = {
        hub,
        sensors: new Map(),
        connectionOrder: current.connectionOrder,
        color: lego.colorFromText(hub.uuid).hex,
        onAttach: () => undefined,
        onDetach: () => undefined,
        onDisconnect: () => undefined,
      };
      logger.info('Hub connected', {
        name: hub.name || 'Unnamed hub',
        type: hub.type,
        connectionOrder: session.connectionOrder,
      });
      // Check whether this hub session is still the active connection.
      const isCurrent = (): boolean =>
        current.mounted && current.sessions.get(hub.uuid) === session;

      // Publish hub metadata and schedule the next telemetry refresh.
      function refresh(): void {
        if (!isCurrent()) return;
        if (session.timer) clearTimeout(session.timer);
        publish(hub);
        session.timer = setTimeout(() => {
          try {
            refresh();
          } catch (cause) {
            reportError(cause);
          }
        }, 1000);
      }

      // Subscribe to system sensor data when a device attaches.
      async function attach(device: RawDevice): Promise<void> {
        if (
          device.type === CONSTS.DeviceType.VOLTAGE_SENSOR ||
          device.type === CONSTS.DeviceType.CURRENT_SENSOR
        ) {
          if (session.sensors.get(device.portId) !== device) {
            device.autoSubscribe = false;
            session.sensors.set(device.portId, device);
            await hub.subscribe(device.portId, device.type, 0);
          }
        }
        if (isCurrent()) refresh();
      }

      session.onAttach = (device) => {
        void attach(device).catch(reportError);
      };
      session.onDetach = (device) => {
        session.sensors.delete(device.portId);
        if (isCurrent()) {
          try {
            refresh();
          } catch (cause) {
            reportError(cause);
          }
        }
      };
      session.onDisconnect = () => {
        if (!isCurrent()) return;
        logger.info('Hub disconnected', {
          name: hub.name || 'Unnamed hub',
          type: hub.type,
          connectionOrder: session.connectionOrder,
        });
        // The connection is already gone, so no sensor unsubscribe is needed.
        session.sensors.clear();
        stop(session);
        current.sessions.delete(hub.uuid);
        markOffline(hub.uuid);
      };
      current.sessions.set(hub.uuid, session);
      hub.on('attach', session.onAttach);
      hub.on('detach', session.onDetach);
      hub.on('disconnect', session.onDisconnect);
      refresh();
      hub.getDevices().forEach((device) => session.onAttach(device));
    }

    // Scan for a hub, connect it, and begin tracking its session.
    const addHub = (): Promise<RawHub> =>
      execute(async () => {
        const { current } = lifecycle;
        if (current.connecting) throw new Error('Already connecting a hub');
        current.connecting = true;
        setConnecting(true);
        try {
          const hub = await lego.add();
          if (!current.mounted) {
            await hub.disconnect();
            throw new Error('HubsProvider was unmounted during connection');
          }
          start(hub, current);
          return hub;
        } finally {
          current.connecting = false;
          if (current.mounted) setConnecting(false);
        }
      });

    // Transfer saved offline-hub metadata to a matching live connection.
    const replaceOfflineHub = (oldUuid: string, newUuid: string): void => {
      try {
        if (!lifecycle.current.mounted)
          throw new Error('HubsProvider is not mounted');
        if (oldUuid === newUuid) throw new Error('A hub cannot replace itself');
        const oldHub = hubs.get(oldUuid);
        const newHub = hubs.get(newUuid);
        const session = lifecycle.current.sessions.get(newUuid);
        if (!oldHub || oldHub.online)
          throw new Error('The saved hub is no longer offline');
        if (
          !newHub?.online ||
          !session ||
          !session.hub.connected ||
          lifecycle.current.sessions.has(oldUuid)
        )
          throw new Error('A hub connection changed during replacement');
        session.color = oldHub.color;
        const next = new Map(hubs);
        next.set(newUuid, { ...newHub, color: oldHub.color });
        next.delete(oldUuid);
        setHubs(next);
        setError(null);
      } catch (cause) {
        reportError(cause);
        throw cause;
      }
    };

    // Publish updated telemetry for one connected hub.
    const refreshHub = (uuid: string): Promise<void> =>
      execute(() => {
        const { hub } = getSession(uuid);
        publish(hub);
      });

    // Rename a connected hub and publish its updated metadata.
    const renameHub = (uuid: string, name: string): Promise<void> =>
      execute(async () => {
        const session = getSession(uuid);
        if (!session.hub.setName) throw new Error('Hub cannot be renamed');
        await session.hub.setName(name);
        if (lifecycle.current.sessions.get(uuid) === session) {
          publish(session.hub);
        }
      });

    // Disconnect or shut down a hub and settle its session state.
    async function endConnection(
      uuid: string,
      method: 'disconnect' | 'shutdown'
    ): Promise<void> {
      const session = getSession(uuid);
      if (method === 'shutdown') {
        if (!session.hub.shutdown) throw new Error('Hub cannot be shut down');
        await session.hub.shutdown();
      } else {
        await session.hub.disconnect();
      }
      if (lifecycle.current.sessions.get(uuid) === session) {
        session.onDisconnect();
      }
    }

    // Disconnect and remove a hub from the active inventory.
    const removeHub = (uuid: string): Promise<void> =>
      execute(async () => {
        if (!hubs.has(uuid)) throw new Error(`Hub not found: ${uuid}`);
        const session = lifecycle.current.sessions.get(uuid);
        if (session) await endConnection(uuid, 'disconnect');
        if (lifecycle.current.sessions.has(uuid)) {
          throw new Error(`Hub reconnected during removal: ${uuid}`);
        }
        setHubs((previous) => {
          const next = new Map(previous);
          next.delete(uuid);
          return next;
        });
      });

    // Restore saved hub metadata while preserving live connections.
    const restoreProjectHubs = (projectHubs: readonly ProjectHub[]) => {
      const restored = new Map<string, HubInfo>(
        projectHubs.map((hub) => [
          hub.uuid,
          {
            ...hub,
            connectionOrder: 0,
            online: false,
            system: {},
          },
        ])
      );
      lifecycle.current.sessions.forEach((session, uuid) => {
        if (session.hub.connected) {
          restored.set(uuid, hubInfo(session.hub, session));
        }
      });
      return () => setHubs(restored);
    };

    return {
      hubs,
      error,
      connecting,
      restoreProjectHubs,
      addHub,
      replaceOfflineHub,
      refreshHub,
      renameHub,
      removeHub,
      disconnectHub: (uuid) => execute(() => endConnection(uuid, 'disconnect')),
      shutdownHub: (uuid) => execute(() => endConnection(uuid, 'shutdown')),
      setHubColor: (uuid, color, expectedHub) =>
        execute(() => {
          const session = getSession(uuid);
          if (session.hub !== expectedHub)
            throw new Error('Hub connection changed');
          if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
            throw new Error('Invalid hub color');
          session.color = color;
          publish(session.hub);
        }, false),
    };
  }, [hubs, error, connecting, reportError, stop]);

  return <hubsContext.Provider value={value}>{children}</hubsContext.Provider>;
}

const hookFactory = contextHook(
  hubsContext,
  'Hub hooks must be used within a HubsProvider'
);

export const useHubs = hookFactory('hubs');
// Select one hub by UUID from the hub context.
export const useHub = (uuid: string | undefined): HubInfo | undefined =>
  uuid ? useHubs().get(uuid) : undefined;
// Select the most recently connected online hub.
export const useLatestConnectedHub = (): HubInfo | null =>
  [...useHubs().values()].reduce<HubInfo | null>(
    (latest, hub) =>
      hub.online && (!latest || hub.connectionOrder > latest.connectionOrder)
        ? hub
        : latest,
    null
  );
// Select a hub by its stable MAC address.
export const useHubByMac = (mac: string): HubInfo | undefined =>
  [...useHubs().values()].find((hub) => hub.mac === mac);
export const useHubsError = hookFactory('error');
export const useConnectingHub = hookFactory('connecting');
export const useRestoreProjectHubs = hookFactory('restoreProjectHubs');
export const useAddHub = hookFactory('addHub');
export const useCommitOfflineHubReplacement = hookFactory('replaceOfflineHub');
export const useRefreshHub = hookFactory('refreshHub');
export const useRenameHub = hookFactory('renameHub');
export const useRemoveHub = hookFactory('removeHub');
export const useDisconnectHub = hookFactory('disconnectHub');
export const useShutdownHub = hookFactory('shutdownHub');
export const useSetHubColor = hookFactory('setHubColor');
