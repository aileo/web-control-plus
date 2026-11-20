import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  controlOptions,
  controlTypes,
  validateControlShortcuts,
  isCompatible,
  isLightControlType,
  motorDirection,
  supportsServo,
} from '../controls';
import {
  boardOccupancy,
  canPlace,
  findSpace,
  isSupportedSize,
} from '../control-layout';
import { hasSameHubSignature } from '../hub-replacement';
import { isBoardColor, type BoardColor } from '../board-colors';
import type {
  BoardOccupant,
  Board,
  Control,
  ControlType,
  DeviceInfo,
  HubInfo,
  Rect,
  SensorTarget,
} from '../types';
import {
  createProjectSnapshot,
  projectContentKey,
  validateProject,
  type LocalProjectIdentity,
  type ProjectHardware,
  type ProjectSnapshot,
} from '../project';
import logger from '../../utils/logger';
import { ledCapabilities, type LightChanges } from '../leds';
import PositionMotor, { type PositionState } from '../position-motor';
import contextHook from './context-hook';
import {
  useHubs,
  useCommitOfflineHubReplacement,
  useRestoreProjectHubs,
} from './useHubs';
import useHelpPreference from './useHelpPreference';
import {
  useDevices,
  useIsDeviceCurrent,
  useRemoveOfflineHubDevices,
  useRestoreProjectDevices,
  useSetDeviceSpeed,
  useSetDeviceLight,
  useSubscribeDevice,
  useUnsubscribeDevice,
} from './useDevices';
import { useControlKeyboard, type KeyPressEntry } from './useControlKeyboard';

type DeviceMap = Map<string, Map<string, DeviceInfo>>;
// Collect the persisted hub and device details for project snapshots.
function projectHardware(
  hubs: Map<string, HubInfo>,
  devices: DeviceMap
): ProjectHardware {
  return {
    hubs: [...hubs.values()].map(({ uuid, name, mac, type, color }) => ({
      uuid,
      name,
      mac,
      type,
      color,
    })),
    devices: [...devices.entries()]
      .filter(([uuid]) => hubs.has(uuid))
      .flatMap(([, ports]) =>
        [...ports.values()].map(({ uuid, mac, port, hubType, type }) => ({
          uuid,
          mac,
          port,
          hubType,
          type,
        }))
      ),
  };
}
type ControlInput = {
  type: ControlType;
  uuid: string;
  port: string;
  title?: string;
  w?: number;
  h?: number;
  options?: unknown;
};
type ControlDraft = Rect & {
  id: string;
  type: ControlType;
  title: string;
  uuid: string;
  port: string;
  options?: unknown;
};
type ControlChanges = {
  title?: string;
  uuid?: string;
  port?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  options?: Record<string, unknown>;
};
type ControlTarget = {
  uuid: string;
  port: string;
  connectionId: number;
};
type ExpectedMotorTarget = ControlTarget & {
  owner?: object;
  release?: boolean;
};
type SensorState = {
  state: 'pending' | 'ready' | 'failed' | 'cleanup-failed';
  error: unknown;
};
type OwnedSubscription = SensorState & {
  target: SensorTarget;
  reset?: boolean;
};
type ControlLifecycle = {
  mounted: boolean;
  subscriptions: Map<string, OwnedSubscription>;
  desired: Map<string, SensorTarget>;
  subscriptionQueue: Promise<void>;
  motorQueues: Map<string, Promise<void | undefined>>;
  tickets: Map<string, number>;
  stops: Map<string, { ticket: number; pending: Promise<void | undefined> }>;
  activeMotors: Map<string, ControlTarget>;
  positionMotors: Map<string, { target: ControlTarget; motor: PositionMotor }>;
  calibrating: Map<string, object>;
  positionRequests: Map<string, object>;
  intendedSpeeds: Map<
    string,
    { target: ControlTarget; speed: number; owner?: object }
  >;
  keyPresses: Map<string, KeyPressEntry[]>;
  locks: Set<string>;
};
type ControlContextValue = {
  controls: Map<string, Control>;
  allControls: Map<string, Control>;
  boards: Board[];
  selectedBoardId: string;
  activeBoards: Set<string>;
  addBoard: () => void;
  selectBoard: (id: string) => void;
  updateBoardSettings: (id: string, name: string, color?: BoardColor) => void;
  removeBoard: (id: string) => Promise<void>;
  replaceOfflineHub: (oldUuid: string, newUuid: string) => Promise<void>;
  stopAll: () => Promise<void>;
  snapshotProject: (name: string) => ProjectSnapshot;
  restoreProject: (
    snapshot: ProjectSnapshot,
    beforePublish?: () => void
  ) => Promise<void>;
  markProjectSaved: (snapshot: ProjectSnapshot) => void;
  activeLocalSave: LocalProjectIdentity | null;
  setActiveLocalSave: (identity: LocalProjectIdentity | null) => void;
  projectDirty: boolean;
  projectBusy: boolean;
  occupancy: ReadonlyMap<string, BoardOccupant>;
  instructions: boolean;
  dismissInstructions: () => void;
  helpPreference: ReturnType<typeof useHelpPreference>;
  error: unknown;
  issues: Map<string, unknown>;
  sensorStates: Map<string, SensorState>;
  pendingSpeeds: Map<string, number>;
  positionStates: Map<string, PositionState>;
  add: (input: ControlInput) => Promise<Control>;
  update: (id: string, changes: ControlChanges) => Promise<Control>;
  remove: (id: string) => Promise<void>;
  speed: (
    id: string,
    speed: number,
    expected?: ExpectedMotorTarget
  ) => Promise<void | undefined>;
  calibrate: (id: string) => Promise<void>;
  position: (id: string, fraction: number) => Promise<void>;
  light: (
    id: string,
    changes: LightChanges,
    expected?: ControlTarget
  ) => Promise<void>;
  retry: () => void;
  clearError: () => void;
};

const controlsContext = createContext<ControlContextValue | null>(null);
const pageIsHidden = () => document.visibilityState === 'hidden';
// Build a stable key for one motor connection.
const connectionKey = ({ uuid, port, connectionId }: ControlTarget): string =>
  JSON.stringify([uuid, port, connectionId]);
// Build a stable key for one sensor subscription.
const subscriptionKey = (target: SensorTarget): string =>
  JSON.stringify([target.uuid, target.port, target.connectionId, target.mode]);
// Allocate an unused serial identifier without colliding with existing records.
function allocateSerialId(
  prefix: string,
  serial: { current: number },
  isUsed: (id: string) => boolean
): string {
  while (serial.current < Number.MAX_SAFE_INTEGER) {
    serial.current += 1;
    const id = `${prefix}${serial.current}`;
    if (!isUsed(id)) return id;
  }
  throw new Error('Unable to allocate a unique identifier');
}

// Resolve a control's active sensor subscription target, if available.
function sensorTarget(
  control: Control | undefined,
  device: DeviceInfo | undefined,
  hub: HubInfo | undefined
): SensorTarget | null {
  if (!control) return null;
  const definition = controlTypes[control.type];
  if (
    !hub?.online ||
    !device?.connected ||
    typeof device.connectionId !== 'number' ||
    !isCompatible(control.type, device) ||
    !definition.mode
  )
    return null;
  return {
    uuid: control.uuid,
    port: control.port,
    connectionId: device.connectionId,
    mode: definition.mode(device.type.num, device.hubType),
  };
}

// Check whether a sensor control owns the device's light output mode.
function lightConflict(
  control: Control,
  controls: ReadonlyMap<string, Control>,
  devices: DeviceMap,
  hubs: Map<string, HubInfo>
): boolean {
  const device = devices.get(control.uuid)?.get(control.port);
  const capabilities = ledCapabilities(device?.type?.num, device?.hubType);
  return Boolean(
    capabilities?.mode !== undefined &&
    [...controls.values()].some((other) => {
      if (other.uuid !== control.uuid || other.port !== control.port)
        return false;
      const target = sensorTarget(other, device, hubs.get(control.uuid));
      return target && target.mode !== capabilities.mode;
    })
  );
}

// Manage controls, boards, subscriptions, and motor commands for the app.
export function ControlsProvider({ children }: PropsWithChildren) {
  const hubs = useHubs();
  const commitOfflineHubReplacement = useCommitOfflineHubReplacement();
  const commitOfflineHubReplacementRef = useRef(commitOfflineHubReplacement);
  commitOfflineHubReplacementRef.current = commitOfflineHubReplacement;
  const devices = useDevices();
  const removeOfflineHubDevices = useRemoveOfflineHubDevices();
  const restoreProjectHubs = useRestoreProjectHubs();
  const restoreProjectDevices = useRestoreProjectDevices();
  const setDeviceSpeed = useSetDeviceSpeed();
  const setDeviceLight = useSetDeviceLight();
  const subscribe = useSubscribeDevice();
  const unsubscribe = useUnsubscribeDevice();
  const isCurrent = useIsDeviceCurrent();
  const [controls, setControls] = useState<Map<string, Control>>(
    () => new Map()
  );
  const [boards, setBoards] = useState<Board[]>([
    { id: 'board-1', name: 'Board 1', controlIds: [] },
  ]);
  const [selectedBoardId, setSelectedBoardId] = useState('board-1');
  const boardsRef = useRef(boards);
  const selectedRef = useRef(selectedBoardId);
  const boardSerial = useRef(1);
  const removingBoard = useRef(false);
  const projectChange = useRef(false);
  const keepUnavailableControls = useRef(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectBaseline, setProjectBaseline] = useState(() =>
    projectContentKey(
      createProjectSnapshot('Current project', boards, selectedBoardId, [])
    )
  );
  const [activeLocalSave, setActiveLocalSave] =
    useState<LocalProjectIdentity | null>(null);
  const helpPreference = useHelpPreference();
  const [instructions, setInstructions] = useState(
    () => !helpPreference.hidden
  );
  const [error, setError] = useState<unknown>(null);
  const [issues, setIssues] = useState<Map<string, unknown>>(() => new Map());
  const [sensorStates, setSensorStates] = useState<Map<string, SensorState>>(
    () => new Map()
  );
  const [retry, setRetry] = useState(0);
  const [pendingSpeeds, setPendingSpeeds] = useState<Map<string, number>>(
    () => new Map()
  );
  const [positionStates, setPositionStates] = useState<
    Map<string, PositionState>
  >(() => new Map());
  const records = useRef<Map<string, Control>>(controls);
  const latest = useRef({ hubs, devices, instructions });
  latest.current = { hubs, devices, instructions };
  const serial = useRef(0);
  const previousRetry = useRef(0);
  const life = useRef<ControlLifecycle>({
    mounted: false,
    subscriptions: new Map(),
    desired: new Map(),
    subscriptionQueue: Promise.resolve(),
    motorQueues: new Map(),
    tickets: new Map(),
    stops: new Map(),
    activeMotors: new Map(),
    positionMotors: new Map(),
    calibrating: new Map(),
    positionRequests: new Map(),
    intendedSpeeds: new Map(),
    keyPresses: new Map(),
    locks: new Set(),
  });
  // Hide board instructions for the current application session.
  const dismissInstructions = useCallback(() => {
    latest.current.instructions = false;
    setInstructions(false);
  }, []);
  const selectedControls = useMemo(() => {
    const ids = new Set(
      boards.find((board) => board.id === selectedBoardId)?.controlIds
    );
    return new Map([...controls].filter(([id]) => ids.has(id)));
  }, [boards, controls, selectedBoardId]);
  const occupancy = useMemo(
    () => boardOccupancy(selectedControls, instructions),
    [selectedControls, instructions]
  );
  // Select the current controls assigned to a board.
  const controlsForBoard = useCallback((id: string) => {
    const ids = new Set(
      boardsRef.current.find((board) => board.id === id)?.controlIds
    );
    return new Map(
      [...records.current].filter(([controlId]) => ids.has(controlId))
    );
  }, []);
  // Update board state and its synchronous reference together.
  const updateBoards = useCallback((next: Board[]) => {
    boardsRef.current = next;
    setBoards(next);
  }, []);
  // Create a project snapshot from the current controls, boards, and hardware.
  const snapshotProject = useCallback(
    (name: string) =>
      createProjectSnapshot(
        name,
        boardsRef.current,
        selectedRef.current,
        [...records.current.values()],
        projectHardware(hubs, devices)
      ),
    [devices, hubs]
  );
  // Record the project contents that should be treated as saved.
  const markProjectSaved = useCallback((snapshot: ProjectSnapshot) => {
    setProjectBaseline(projectContentKey(snapshot));
  }, []);
  const projectDirty =
    projectContentKey(
      createProjectSnapshot(
        'Current project',
        boards,
        selectedBoardId,
        [...controls.values()],
        projectHardware(hubs, devices)
      )
    ) !== projectBaseline;

  // Commit control changes and remove stale board and issue references.
  const commit = useCallback((next: Map<string, Control>) => {
    records.current = next;
    setControls(next);
    const updated = boardsRef.current.map((board) => ({
      ...board,
      controlIds: board.controlIds.filter((id) => next.has(id)),
    }));
    boardsRef.current = updated;
    setBoards(updated);
    setIssues((previous) => {
      if ([...previous.keys()].every((id) => next.has(id))) return previous;
      return new Map([...previous].filter(([id]) => next.has(id)));
    });
  }, []);

  // Log and publish a control action failure.
  const report = useCallback((cause: unknown, id?: string | null) => {
    logger.error('Control action failed', cause);
    if (!life.current?.mounted) return;
    setError(cause);
    if (id) setIssues((previous) => new Map(previous).set(id, cause));
  }, []);

  // Verify that a control target still refers to the current device connection.
  const targetIsCurrent = useCallback(
    (target: ControlTarget) =>
      isCurrent(target.uuid, target.port, target.connectionId),
    [isCurrent]
  );

  // Publish sensor subscription states from the active lifecycle.
  const publishSensorStates = useCallback((current: ControlLifecycle) => {
    if (!current.mounted) return;
    setSensorStates(
      new Map(
        [...current.subscriptions].map(([key, owned]) => [
          key,
          { state: owned.state, error: owned.error },
        ])
      )
    );
  }, []);

  // Reconcile desired sensor subscriptions with active device subscriptions.
  const reconcile = useCallback(
    (current: ControlLifecycle) => {
      // Remove obsolete subscriptions and create any newly desired ones.
      const sync = async () => {
        await Promise.all(
          [...current.subscriptions].map(async ([key, owned]) => {
            if (current.desired.has(key) && !owned.reset) return;
            if (targetIsCurrent(owned.target)) {
              try {
                await unsubscribe(
                  owned.target.uuid,
                  owned.target.port,
                  owned.target.mode,
                  owned.target.connectionId
                );
              } catch (cause) {
                owned.error = cause;
                owned.state = 'cleanup-failed';
                report(cause);
                publishSensorStates(current);
                return;
              }
            }
            current.subscriptions.delete(key);
          })
        );
        await Promise.all(
          [...current.desired].map(async ([key, target]) => {
            if (current.subscriptions.has(key) || !targetIsCurrent(target))
              return;
            const owned: OwnedSubscription = {
              target,
              state: 'pending',
              error: null,
            };
            current.subscriptions.set(key, owned);
            publishSensorStates(current);
            try {
              await subscribe(
                target.uuid,
                target.port,
                target.mode,
                target.connectionId
              );
              owned.state = 'ready';
            } catch (cause) {
              owned.state = 'failed';
              owned.error = cause;
              if (targetIsCurrent(target)) report(cause);
            }
            publishSensorStates(current);
          })
        );
        publishSensorStates(current);
      };
      current.subscriptionQueue = current.subscriptionQueue.then(sync, sync);
      current.subscriptionQueue.catch(report);
    },
    [publishSensorStates, report, subscribe, targetIsCurrent, unsubscribe]
  );

  // Serialize motor commands and track their pending state and ownership.
  const queueSpeed = useCallback(
    (
      target: ControlTarget,
      speed: number,
      owner?: object,
      force = false
    ): Promise<void | undefined> => {
      const { current } = life;
      const key = connectionKey(target);
      const positionPending = current.positionRequests.delete(key);
      if (speed === 0) {
        current.calibrating.delete(key);
        current.keyPresses.forEach((entries, token) => {
          current.keyPresses.set(
            token,
            entries.filter((entry) => connectionKey(entry.target) !== key)
          );
        });
      }
      const activeStop = current.stops.get(key);
      if (
        speed === 0 &&
        !force &&
        !positionPending &&
        activeStop &&
        activeStop.ticket === current.tickets.get(key)
      ) {
        return activeStop.pending;
      }
      const ticket = (current.tickets.get(key) || 0) + 1;
      current.tickets.set(key, ticket);
      // Interrupt position work immediately, rather than queueing behind it.
      const positionStop = current.positionMotors
        .get(key)
        ?.motor.stop()
        .then(
          () => null,
          (cause: unknown) => ({ cause })
        );
      current.intendedSpeeds.set(key, { target, speed, owner });
      if (current.mounted)
        setPendingSpeeds((previous) => new Map(previous).set(key, speed));
      if (speed !== 0) current.activeMotors.set(key, target);
      // Send this motor command only if its ticket remains current.
      const send = async (): Promise<void | undefined> => {
        if (speed !== 0) {
          const stopped = await positionStop;
          if (stopped) throw stopped.cause;
        }
        if (!current.mounted || current.tickets.get(key) !== ticket) return;
        if (!targetIsCurrent(target)) throw new Error('Motor disconnected');
        const speedCommand = setDeviceSpeed(
          target.uuid,
          target.port,
          speed,
          target.connectionId
        );
        if (speed === 0) {
          const [speedResult, stopped] = await Promise.all([
            speedCommand.then(
              () => null,
              (cause: unknown) => ({ cause })
            ),
            positionStop,
          ]);
          if (speedResult && stopped)
            throw new AggregateError(
              [speedResult.cause, stopped.cause],
              'Speed and position stops failed'
            );
          if (speedResult) throw speedResult.cause;
          if (stopped) throw stopped.cause;
        } else await speedCommand;
        if (speed === 0 && current.tickets.get(key) === ticket) {
          current.activeMotors.delete(key);
        }
      };
      const pending = (current.motorQueues.get(key) || Promise.resolve()).then(
        send,
        send
      );
      current.motorQueues.set(key, pending);
      if (speed === 0) current.stops.set(key, { ticket, pending });
      // Remove completed command state when this ticket is still current.
      const clean = () => {
        if (current.mounted && current.tickets.get(key) === ticket)
          setPendingSpeeds((previous) => {
            const next = new Map(previous);
            next.delete(key);
            return next;
          });
        if (current.motorQueues.get(key) === pending)
          current.motorQueues.delete(key);
        if (current.stops.get(key)?.pending === pending)
          current.stops.delete(key);
      };
      pending.then(clean, () => {
        if (current.tickets.get(key) === ticket) {
          const confirmed =
            latest.current.devices.get(target.uuid)?.get(target.port)?.commands
              .speed ?? 0;
          current.intendedSpeeds.set(key, { target, speed: confirmed, owner });
        }
        clean();
      });
      return pending;
    },
    [setDeviceSpeed, targetIsCurrent]
  );

  useEffect(() => {
    const current: ControlLifecycle = {
      mounted: true,
      subscriptions: new Map(),
      desired: new Map(),
      subscriptionQueue: Promise.resolve(),
      motorQueues: new Map(),
      tickets: new Map(),
      stops: new Map(),
      activeMotors: new Map(),
      positionMotors: new Map(),
      calibrating: new Map(),
      positionRequests: new Map(),
      intendedSpeeds: new Map(),
      keyPresses: new Map(),
      locks: new Set(),
    };
    life.current = current;
    // Stop all active motors when the document is being hidden or closed.
    const stopMotors = () => {
      current.positionRequests.forEach((_owner, key) => {
        const target = current.positionMotors.get(key)?.target;
        if (target) current.activeMotors.set(key, target);
      });
      current.activeMotors.forEach((target, key) => {
        if (!targetIsCurrent(target)) current.activeMotors.delete(key);
        else queueSpeed(target, 0).catch(report);
      });
    };
    // Stop motors when the page becomes hidden.
    const visibility = () => {
      if (document.visibilityState === 'hidden') stopMotors();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stopMotors);
    return () => {
      current.mounted = false;
      current.desired = new Map();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stopMotors);
      // DevicesProvider also stops its active motors on full-provider teardown.
      current.activeMotors.forEach((target) => {
        if (targetIsCurrent(target)) {
          setDeviceSpeed(
            target.uuid,
            target.port,
            0,
            target.connectionId
          ).catch(report);
        }
      });
      current.positionMotors.forEach(({ motor }) => {
        motor.dispose().catch(report);
      });
      reconcile(current);
    };
  }, [queueSpeed, reconcile, report, setDeviceSpeed, targetIsCurrent]);

  const desired = new Map<string, SensorTarget>();
  controls.forEach((control) => {
    const device = devices.get(control.uuid)?.get(control.port);
    const target = sensorTarget(control, device, hubs.get(control.uuid));
    if (target) desired.set(subscriptionKey(target), target);
  });
  const desiredSignature = JSON.stringify([...desired.keys()].sort());
  const desiredRef = useRef(desired);
  desiredRef.current = desired;
  useEffect(() => {
    const { current } = life;
    current.desired = desiredRef.current;
    current.activeMotors.forEach((target, key) => {
      if (!targetIsCurrent(target)) current.activeMotors.delete(key);
    });
    if (retry !== previousRetry.current) {
      previousRetry.current = retry;
      current.subscriptions.forEach((owned, key) => {
        if (owned.state === 'failed') current.subscriptions.delete(key);
        if (owned.state === 'cleanup-failed') owned.reset = true;
      });
    }
    reconcile(current);
  }, [desiredSignature, retry, reconcile, targetIsCurrent]);

  useEffect(() => {
    life.current.positionMotors.forEach(({ target, motor }, key) => {
      if (!targetIsCurrent(target)) {
        life.current.tickets.set(key, (life.current.tickets.get(key) || 0) + 1);
        life.current.positionMotors.delete(key);
        life.current.calibrating.delete(key);
        life.current.positionRequests.delete(key);
        motor.dispose().catch(report);
        setPositionStates((previous) => {
          const next = new Map(previous);
          next.delete(key);
          return next;
        });
      }
    });
    life.current.activeMotors.forEach((target, key) => {
      if (!targetIsCurrent(target)) life.current.activeMotors.delete(key);
    });
    life.current.intendedSpeeds.forEach(({ target }, key) => {
      if (!targetIsCurrent(target)) life.current.intendedSpeeds.delete(key);
    });
    setPendingSpeeds((previous) => {
      const next = new Map(
        [...previous].filter(([key]) => life.current.intendedSpeeds.has(key))
      );
      return next.size === previous.size ? previous : next;
    });
  }, [devices, targetIsCurrent, report]);

  useEffect(() => {
    if (keepUnavailableControls.current) return;
    const next = new Map(
      [...records.current].filter(([, control]) => hubs.has(control.uuid))
    );
    if (next.size !== records.current.size) commit(next);
  }, [hubs, commit]);

  const actions = useMemo<
    Pick<
      ControlContextValue,
      | 'add'
      | 'update'
      | 'remove'
      | 'replaceOfflineHub'
      | 'speed'
      | 'calibrate'
      | 'position'
      | 'light'
      | 'retry'
      | 'clearError'
    >
  >(() => {
    // Validate provider state, run one control action, and report failures.
    async function execute<T>(
      id: string | null,
      action: (ensureCurrent: () => void) => T | Promise<T>
    ): Promise<T> {
      try {
        const { current } = life;
        // Guard asynchronous work against provider unmount or replacement.
        const ensureCurrent = (): void => {
          if (!current.mounted || current !== life.current) {
            throw new Error('ControlsProvider is not mounted');
          }
        };
        ensureCurrent();
        if (projectChange.current) {
          throw new Error('A project is being opened; try again shortly');
        }
        setError(null);
        if (id)
          setIssues((previous) => {
            const next = new Map(previous);
            next.delete(id);
            return next;
          });
        return await action(ensureCurrent);
      } catch (cause) {
        report(cause, id);
        throw cause;
      }
    }

    // Return a control record or report that it has been removed.
    function getControl(id: string): Control {
      const control = records.current.get(id);
      if (!control) throw new Error('This control no longer exists');
      return control;
    }

    // Resolve and validate the connected device target for a control.
    function getTarget(
      control: Pick<Control, 'uuid' | 'port' | 'type'>
    ): ControlTarget {
      const device = latest.current.devices
        .get(control.uuid)
        ?.get(control.port);
      if (
        !latest.current.hubs.get(control.uuid)?.online ||
        !device?.connected ||
        typeof device.connectionId !== 'number'
      ) {
        throw new Error('Device is disconnected');
      }
      if (!isCompatible(control.type, device)) {
        throw new Error('This device is not compatible with the control');
      }
      const target = {
        uuid: control.uuid,
        port: control.port,
        connectionId: device.connectionId,
      };
      if (!targetIsCurrent(target)) throw new Error('Device is disconnected');
      return target;
    }

    // Validate a control's options, board position, and shortcut bindings.
    function validate(control: ControlDraft, excludeId?: string): Control {
      if (!Object.hasOwn(controlTypes, control.type)) {
        throw new Error('Unknown control type');
      }
      if (
        typeof control.title !== 'string' ||
        !control.title.trim() ||
        control.title.trim().length > 80
      ) {
        throw new Error('Enter a title between 1 and 80 characters');
      }
      if (!isSupportedSize(control.type, control))
        throw new Error('Unsupported control size');
      if (
        !canPlace(
          boardOccupancy(
            controlsForBoard(
              boardsRef.current.find((board) =>
                board.controlIds.includes(control.id)
              )?.id ?? selectedRef.current
            ),
            latest.current.instructions
          ),
          control,
          excludeId
        )
      ) {
        throw new Error('Choose an empty position inside the 10 by 6 board');
      }
      const validated = {
        ...control,
        title: control.title.trim(),
        options: controlOptions(control.type, control.options),
      } as Control;
      if (
        (validated.type === 'slider' || validated.type === 'arrows') &&
        validated.options.mode === 'servo' &&
        !supportsServo(
          latest.current.devices.get(validated.uuid)?.get(validated.port)
        )
      ) {
        throw new Error('Servo mode is not available on this device');
      }
      const boardId =
        boardsRef.current.find((board) => board.controlIds.includes(control.id))
          ?.id ?? selectedRef.current;
      const others = [...controlsForBoard(boardId).values()].filter(
        (other) =>
          other.id !== excludeId &&
          other.uuid === control.uuid &&
          other.port === control.port
      );
      validateControlShortcuts([...others, validated]);
      return validated;
    }

    // Prevent concurrent mutations of the same control.
    async function locked<T>(
      id: string,
      action: () => T | Promise<T>
    ): Promise<T> {
      const { current } = life;
      if (current.locks.has(id))
        throw new Error('Control is busy; please wait');
      current.locks.add(id);
      try {
        return await action();
      } finally {
        current.locks.delete(id);
      }
    }

    // Stop a motor before changing or removing its control target.
    async function stopBeforeChange(control: Control): Promise<void> {
      const device = latest.current.devices
        .get(control.uuid)
        ?.get(control.port);
      if (
        controlTypes[control.type].motor &&
        device?.connected &&
        isCompatible(control.type, device)
      ) {
        const target = getTarget(control);
        await queueSpeed(target, 0);
        const key = connectionKey(target);
        const owned = life.current.positionMotors.get(key);
        if (owned) {
          life.current.positionMotors.delete(key);
          setPositionStates((previous) => {
            const next = new Map(previous);
            next.delete(key);
            return next;
          });
          await owned.motor.dispose();
        }
      }
    }

    function positionMotor(target: ControlTarget): PositionMotor {
      const { current } = life;
      const key = connectionKey(target);
      const existing = current.positionMotors.get(key);
      if (existing) return existing.motor;
      const device = latest.current.devices.get(target.uuid)?.get(target.port);
      const driver = device?.positionDriver;
      if (!driver || !driver.referenceValid())
        throw new Error('Positioning is not available');
      const motor = new PositionMotor(
        driver,
        () => current === life.current && targetIsCurrent(target),
        (state) => {
          if (
            current.mounted &&
            current.positionMotors.get(key)?.motor === motor
          )
            setPositionStates((previous) => new Map(previous).set(key, state));
        },
        () => {
          const owned = current.positionMotors.get(key);
          if (!owned) return;
          current.positionRequests.delete(key);
          current.calibrating.delete(key);
          current.positionMotors.delete(key);
          owned.motor.dispose().catch(report);
          if (targetIsCurrent(target))
            queueSpeed(target, 0, undefined, true).catch(report);
          else current.activeMotors.delete(key);
          if (current.mounted)
            setPositionStates((previous) => {
              const next = new Map(previous);
              next.delete(key);
              return next;
            });
        }
      );
      current.positionMotors.set(key, { target, motor });
      setPositionStates((previous) =>
        new Map(previous).set(key, motor.snapshot())
      );
      return motor;
    }

    async function runPosition(
      id: string,
      operation: 'calibrate' | 'move',
      fraction?: number
    ): Promise<void> {
      const control = getControl(id);
      if (control.type !== 'slider' && control.type !== 'arrows')
        throw new Error('Not a position control');
      if (control.options.mode !== 'servo')
        throw new Error('Control is not in Servo mode');
      if (life.current.locks.has(id)) throw new Error('Control is busy');
      if (pageIsHidden())
        throw new Error('Motor controls are paused while this page is hidden');
      const target = getTarget(control);
      const key = connectionKey(target);
      const { current } = life;
      if (current.calibrating.has(key))
        throw new Error('Motor calibration is in progress');
      const motor = positionMotor(target);
      const stop = queueSpeed(target, 0, undefined, true);
      const ticket = current.tickets.get(key);
      const owner = {};
      current.positionRequests.set(key, owner);
      if (operation === 'calibrate') current.calibrating.set(key, owner);
      try {
        await stop;
        if (
          !current.mounted ||
          ticket !== current.tickets.get(key) ||
          pageIsHidden() ||
          !targetIsCurrent(target)
        )
          return;
        current.activeMotors.set(key, target);
        if (operation === 'calibrate') await motor.calibrate();
        else await motor.moveFraction(fraction ?? NaN);
      } catch (cause) {
        if (ticket === current.tickets.get(key)) throw cause;
      } finally {
        if (current.calibrating.get(key) === owner)
          current.calibrating.delete(key);
        if (current.positionRequests.get(key) === owner)
          current.positionRequests.delete(key);
        if (ticket === current.tickets.get(key))
          current.activeMotors.delete(key);
      }
    }

    return {
      replaceOfflineHub: (oldUuid: string, newUuid: string) =>
        execute(null, (ensureCurrent) => {
          if (projectChange.current || removingBoard.current) {
            throw new Error('Another board change is in progress');
          }
          if (oldUuid === newUuid)
            throw new Error('A hub cannot replace itself');
          const currentHubs = latest.current.hubs;
          const currentDevices = latest.current.devices;
          const oldHub = currentHubs.get(oldUuid);
          const newHub = currentHubs.get(newUuid);
          const oldDevices = currentDevices.get(oldUuid) || new Map();
          const newInventory = currentDevices.get(newUuid) || new Map();
          const newDevices = new Map(
            [...newInventory].filter(([, device]) => device.connected)
          );
          if (!oldHub || oldHub.online)
            throw new Error('The saved hub is no longer offline');
          if (!newHub?.online)
            throw new Error('The new hub is no longer connected');
          if (
            [...oldDevices.values()].some((device) => device.connected) ||
            [...newDevices.values()].some(
              (device) => !isCurrent(newUuid, device.port, device.connectionId)
            )
          ) {
            throw new Error('Hub devices changed during replacement');
          }
          if (!hasSameHubSignature(oldHub, oldDevices, newHub, newDevices)) {
            throw new Error('Hub devices no longer match');
          }

          const affected = [...records.current.values()].filter(
            (control) => control.uuid === oldUuid
          );
          const { current } = life;
          if (
            affected.some((control) => current.locks.has(control.id)) ||
            [...current.activeMotors.values()].some(
              (target) => target.uuid === oldUuid
            ) ||
            [...current.intendedSpeeds.values()].some(
              ({ target }) => target.uuid === oldUuid
            ) ||
            [...current.subscriptions.values()].some(
              ({ target }) => target.uuid === oldUuid
            )
          ) {
            throw new Error(
              'Wait for the disconnected hub controls to clean up'
            );
          }

          const next = new Map(records.current);
          affected.forEach((control) => {
            const rebound = { ...control, uuid: newUuid };
            getTarget(rebound);
            next.set(control.id, validate(rebound, control.id));
          });
          ensureCurrent();
          removeOfflineHubDevices(oldUuid);
          commitOfflineHubReplacementRef.current(oldUuid, newUuid);
          commit(next);
        }),
      add: (input: ControlInput) =>
        execute(null, () => {
          if (removingBoard.current) throw new Error('Board is being removed');
          const definition = controlTypes[input.type];
          const size = {
            w: input.w ?? definition.sizes[0].w,
            h: input.h ?? definition.sizes[0].h,
          };
          if (!isSupportedSize(input.type, size))
            throw new Error('Unsupported control size');
          getTarget(input);
          const position = findSpace(
            boardOccupancy(
              controlsForBoard(selectedRef.current),
              latest.current.instructions
            ),
            size
          );
          if (!position)
            throw new Error('Board full: no space for this control size');
          const id = allocateSerialId('control-', serial, (candidate) =>
            records.current.has(candidate)
          );
          const control = validate({
            id,
            type: input.type,
            title: input.title ?? definition.label,
            uuid: input.uuid,
            port: input.port,
            ...position,
            options: input.options,
          });
          updateBoards(
            boardsRef.current.map((board) =>
              board.id === selectedRef.current
                ? { ...board, controlIds: [...board.controlIds, control.id] }
                : board
            )
          );
          commit(new Map(records.current).set(control.id, control));
          return control;
        }),
      update: (id: string, changes: ControlChanges) =>
        execute(id, (ensureCurrent) =>
          locked(id, async () => {
            const previous = getControl(id);
            if (
              Object.keys(changes).some(
                (key) =>
                  ![
                    'title',
                    'uuid',
                    'port',
                    'x',
                    'y',
                    'w',
                    'h',
                    'options',
                  ].includes(key)
              )
            ) {
              throw new Error('Invalid control settings');
            }
            if (Object.hasOwn(changes, 'options')) {
              controlOptions(previous.type, changes.options);
            }
            let next = validate(
              {
                ...previous,
                ...changes,
                options: { ...previous.options, ...changes.options },
              },
              id
            );
            if (next.uuid !== previous.uuid || next.port !== previous.port) {
              getTarget(next);
              await stopBeforeChange(previous);
              ensureCurrent();
              getControl(id);
              getTarget(next);
              next = validate(next, id);
            } else if (
              (previous.type === 'slider' || previous.type === 'arrows') &&
              (next.type === 'slider' || next.type === 'arrows') &&
              previous.options.mode !== next.options.mode
            ) {
              await stopBeforeChange(previous);
              ensureCurrent();
              getControl(id);
              next = validate(next, id);
            }
            commit(new Map(records.current).set(id, next));
            return next;
          })
        ),
      remove: (id: string) =>
        execute(id, (ensureCurrent) =>
          locked(id, async () => {
            const control = getControl(id);
            await stopBeforeChange(control);
            ensureCurrent();
            const next = new Map(records.current);
            next.delete(id);
            commit(next);
          })
        ),
      speed: (id: string, speed: number, expected?: ExpectedMotorTarget) =>
        execute(id, () => {
          const control = getControl(id);
          if (!controlTypes[control.type].motor)
            throw new Error('Not a motor control');
          if (life.current.locks.has(id))
            throw new Error('Control is busy; please wait');
          if (!Number.isFinite(speed) || speed < -100 || speed > 100) {
            throw new Error('Invalid motor speed');
          }
          if (control.type === 'stop' && speed !== 0) {
            throw new Error('Stop controls only support zero speed');
          }
          if (
            speed !== 0 &&
            (control.type === 'slider' || control.type === 'arrows') &&
            control.options.mode === 'servo'
          )
            throw new Error('Servo controls do not accept speed commands');
          if (speed !== 0 && document.visibilityState === 'hidden') {
            throw new Error(
              'Motor controls are paused while this page is hidden'
            );
          }
          const target = getTarget(control);
          if (
            speed !== 0 &&
            life.current.calibrating.has(connectionKey(target))
          )
            throw new Error('Motor calibration is in progress');
          if (expected && connectionKey(expected) !== connectionKey(target)) {
            throw new Error('Motor connection changed');
          }
          // A release belongs to its input; explicit Stop overrides any input.
          if (
            expected?.release &&
            life.current.intendedSpeeds.get(connectionKey(target))?.owner !==
              expected.owner
          )
            return undefined;
          return queueSpeed(target, speed, expected?.owner);
        }),
      calibrate: (id: string) =>
        execute(id, () => runPosition(id, 'calibrate')),
      position: (id: string, fraction: number) =>
        execute(id, () => runPosition(id, 'move', fraction)),
      light: (id: string, changes: LightChanges, expected?: ControlTarget) =>
        execute(id, () => {
          const control = getControl(id);
          if (!isLightControlType(control.type))
            throw new Error('Not a light control');
          const target = getTarget(control);
          if (expected && connectionKey(expected) !== connectionKey(target))
            throw new Error('Light connection changed');
          return setDeviceLight(
            target.uuid,
            target.port,
            changes,
            target.connectionId,
            () => {
              const latestControl = getControl(id);
              if (!life.current.mounted)
                throw new Error('ControlsProvider is not mounted');
              if (document.visibilityState === 'hidden' && changes.on !== false)
                throw new Error('Light controls are paused while hidden');
              if (
                connectionKey(getTarget(latestControl)) !==
                connectionKey(target)
              )
                throw new Error('Light connection changed');
              if (
                lightConflict(
                  latestControl,
                  records.current,
                  latest.current.devices,
                  latest.current.hubs
                )
              )
                throw new Error('Light is managed by an active sensor control');
            }
          );
        }),
      retry: () => {
        setError(null);
        setRetry((previous) => previous + 1);
      },
      clearError: () => setError(null),
    };
  }, [
    commit,
    controlsForBoard,
    queueSpeed,
    report,
    removeOfflineHubDevices,
    targetIsCurrent,
    setDeviceLight,
    updateBoards,
  ]);

  useControlKeyboard({
    actions,
    controlsForBoard,
    latest,
    life,
    queueSpeed,
    records,
    report,
    selectedRef,
    targetIsCurrent,
  });

  // Release keyboard actions and stop every active motor.
  const stopAll = useCallback(async () => {
    window.dispatchEvent(new window.Event('board-input-release'));
    const targets = [...life.current.activeMotors.values()].filter(
      targetIsCurrent
    );
    const results = await Promise.allSettled(
      targets.map((target) => queueSpeed(target, 0))
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      report(failure.reason);
      throw failure.reason;
    }
  }, [queueSpeed, report, targetIsCurrent]);

  const boardActions = useMemo(
    () => ({
      addBoard: () => {
        if (removingBoard.current || projectChange.current) return;
        const id = allocateSerialId('board-', boardSerial, (candidate) =>
          boardsRef.current.some((board) => board.id === candidate)
        );
        updateBoards([
          ...boardsRef.current,
          {
            id,
            name: `Board ${boardSerial.current}`,
            controlIds: [],
          },
        ]);
        window.dispatchEvent(new window.Event('board-input-release'));
        selectedRef.current = id;
        setSelectedBoardId(id);
      },
      selectBoard: (id: string) => {
        if (
          removingBoard.current ||
          projectChange.current ||
          id === selectedRef.current ||
          !boardsRef.current.some((board) => board.id === id)
        )
          return;
        window.dispatchEvent(new window.Event('board-input-release'));
        selectedRef.current = id;
        setSelectedBoardId(id);
      },
      updateBoardSettings: (id: string, name: string, color?: BoardColor) => {
        if (projectChange.current)
          throw new Error('A project is being opened; try again shortly');
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 80)
          throw new Error('Enter a board name between 1 and 80 characters');
        if (color !== undefined && !isBoardColor(color))
          throw new Error('Invalid board color');
        if (!boardsRef.current.some((board) => board.id === id))
          throw new Error('Board no longer exists');
        updateBoards(
          boardsRef.current.map((board) =>
            board.id === id ? { ...board, name: trimmed, color } : board
          )
        );
      },
      removeBoard: async (id: string) => {
        if (projectChange.current)
          throw new Error('A project is being opened; try again shortly');
        if (removingBoard.current) throw new Error('Board is being removed');
        if (boardsRef.current.length <= 1)
          throw new Error('Keep at least one board');
        const board = boardsRef.current.find((item) => item.id === id);
        if (!board) throw new Error('Board no longer exists');
        removingBoard.current = true;
        try {
          if (selectedRef.current === id)
            window.dispatchEvent(new window.Event('board-input-release'));
          await board.controlIds.reduce(
            (previous, controlId) =>
              previous.then(() =>
                records.current.has(controlId)
                  ? actions.remove(controlId)
                  : undefined
              ),
            Promise.resolve()
          );
          const remaining = boardsRef.current.filter((item) => item.id !== id);
          updateBoards(remaining);
          if (selectedRef.current === id) {
            selectedRef.current = remaining[0].id;
            setSelectedBoardId(remaining[0].id);
          }
        } finally {
          removingBoard.current = false;
        }
      },
      stopAll,
      restoreProject: async (
        input: ProjectSnapshot,
        beforePublish?: () => void
      ) => {
        const snapshot = validateProject(input);
        if (projectChange.current || removingBoard.current) {
          throw new Error('Another board change is in progress');
        }
        if (life.current.locks.size) {
          throw new Error('Wait for the current control action to finish');
        }
        projectChange.current = true;
        setProjectBusy(true);
        try {
          await stopAll();
          const { current } = life;
          await current.subscriptionQueue;
          const cleanupResults = await Promise.all(
            [...current.subscriptions].map(async ([key, owned]) => {
              if (!targetIsCurrent(owned.target)) {
                return { key, failed: false, error: undefined };
              }
              try {
                await unsubscribe(
                  owned.target.uuid,
                  owned.target.port,
                  owned.target.mode,
                  owned.target.connectionId
                );
                return { key, failed: false, error: undefined };
              } catch (cause) {
                owned.error = cause;
                owned.state = 'cleanup-failed';
                report(cause);
                return { key, failed: true, error: cause };
              }
            })
          );
          cleanupResults
            .filter((result) => !result.failed)
            .forEach(({ key }) => current.subscriptions.delete(key));
          publishSensorStates(current);
          const cleanupFailure = cleanupResults.find((result) => result.failed);
          if (cleanupFailure) {
            reconcile(current);
            await current.subscriptionQueue;
            throw cleanupFailure.error;
          }
          if (!current.mounted || current !== life.current) {
            throw new Error(
              'ControlsProvider changed while opening the project'
            );
          }

          const publishHubs = restoreProjectHubs(snapshot.hubs);
          const publishDevices = restoreProjectDevices(snapshot.devices);
          const nextControls = new Map(
            snapshot.controls.map((control) => [control.id, control])
          );
          const baseline = projectContentKey(snapshot);
          beforePublish?.();
          publishHubs();
          publishDevices();
          records.current = nextControls;
          setControls(nextControls);
          boardsRef.current = snapshot.boards;
          setBoards(snapshot.boards);
          selectedRef.current = snapshot.selectedBoardId;
          setSelectedBoardId(snapshot.selectedBoardId);
          keepUnavailableControls.current = true;
          setIssues(new Map());
          setSensorStates(new Map());
          setPendingSpeeds(new Map());
          setError(null);
          setProjectBaseline(baseline);
        } catch (cause) {
          reconcile(life.current);
          report(cause);
          throw cause;
        } finally {
          projectChange.current = false;
          setProjectBusy(false);
        }
      },
    }),
    [
      actions,
      publishSensorStates,
      queueSpeed,
      reconcile,
      report,
      restoreProjectDevices,
      restoreProjectHubs,
      stopAll,
      targetIsCurrent,
      unsubscribe,
      updateBoards,
    ]
  );
  const activeBoards = useMemo(
    () =>
      new Set(
        boards
          .filter((board) =>
            board.controlIds.some((id) => {
              const control = controls.get(id);
              if (!control || !controlTypes[control.type].motor) return false;
              const device = devices.get(control.uuid)?.get(control.port);
              return Boolean(
                hubs.get(control.uuid)?.online &&
                device?.connected &&
                device.commands.speed
              );
            })
          )
          .map((board) => board.id)
      ),
    [boards, controls, devices, hubs]
  );

  const value = useMemo<ControlContextValue>(
    () => ({
      controls: selectedControls,
      allControls: controls,
      boards,
      selectedBoardId,
      activeBoards,
      ...boardActions,
      snapshotProject,
      markProjectSaved,
      activeLocalSave,
      setActiveLocalSave,
      projectDirty,
      projectBusy,
      occupancy,
      instructions,
      dismissInstructions,
      helpPreference,
      error,
      issues,
      sensorStates,
      pendingSpeeds,
      positionStates,
      ...actions,
    }),
    [
      selectedControls,
      controls,
      boards,
      selectedBoardId,
      activeBoards,
      boardActions,
      snapshotProject,
      markProjectSaved,
      activeLocalSave,
      setActiveLocalSave,
      projectDirty,
      projectBusy,
      occupancy,
      instructions,
      dismissInstructions,
      helpPreference,
      error,
      issues,
      sensorStates,
      pendingSpeeds,
      positionStates,
      actions,
    ]
  );
  return (
    <controlsContext.Provider value={value}>
      {children}
    </controlsContext.Provider>
  );
}

const hookFactory = contextHook(
  controlsContext,
  'Control hooks must be used within a ControlsProvider'
);

export const useControls = hookFactory('controls');
export const useBoards = hookFactory('boards');
export const useSelectedBoardId = hookFactory('selectedBoardId');
export const useActiveBoards = hookFactory('activeBoards');
export const useAddBoard = hookFactory('addBoard');
export const useSelectBoard = hookFactory('selectBoard');
export const useUpdateBoardSettings = hookFactory('updateBoardSettings');
export const useRemoveBoard = hookFactory('removeBoard');
export const useReplaceOfflineHubControls = hookFactory('replaceOfflineHub');
export const useStopAll = hookFactory('stopAll');
export const useProjectSnapshot = hookFactory('snapshotProject');
export const useRestoreProject = hookFactory('restoreProject');
export const useMarkProjectSaved = hookFactory('markProjectSaved');
export const useActiveLocalSave = hookFactory('activeLocalSave');
export const useSetActiveLocalSave = hookFactory('setActiveLocalSave');
export const useProjectDirty = hookFactory('projectDirty');
export const useProjectBusy = hookFactory('projectBusy');
export const useBoardOccupancy = hookFactory('occupancy');
export const useBoardInstructions = hookFactory('instructions');
export const useDismissInstructions = hookFactory('dismissInstructions');
export const useHelpVisibilityPreference = hookFactory('helpPreference');
// Select one control record by identifier.
export const useControl = (id: string): Control | undefined =>
  useControls().get(id);
export const useControlsError = hookFactory('error');
export const useClearControlsError = hookFactory('clearError');
export const useAddControl = hookFactory('add');
export const useUpdateControl = hookFactory('update');
export const useRemoveControl = hookFactory('remove');
export const useSetControlSpeed = hookFactory('speed');
export const useCalibrateControl = hookFactory('calibrate');
export const useSetControlPosition = hookFactory('position');
export const usePositionStates = hookFactory('positionStates');
export const useSetControlLight = hookFactory('light');
export const useRetryControls = hookFactory('retry');
const useIssues = hookFactory('issues');
const useSensorStates = hookFactory('sensorStates');
const usePendingSpeeds = hookFactory('pendingSpeeds');
export const useAllControls = hookFactory('allControls');

// Resolve a control's current status and any reported error.
export function useControlStatus(id: string) {
  const control = useControl(id);
  const controls = useAllControls();
  const hubs = useHubs();
  const devices = useDevices();
  const issues = useIssues();
  const states = useSensorStates();
  const hub = control ? hubs.get(control.uuid) : undefined;
  const device = control
    ? devices.get(control.uuid)?.get(control.port)
    : undefined;
  const connected = Boolean(hub?.online && device?.connected);
  const compatible = isCompatible(control?.type, device);
  const target = sensorTarget(control, device, hub);
  const subscription = target && states.get(subscriptionKey(target));
  let reason: string | null = null;
  if (!connected) reason = 'Device disconnected';
  else if (!compatible) reason = 'Different device attached';
  else if (
    (control?.type === 'slider' || control?.type === 'arrows') &&
    control.options.mode === 'servo' &&
    !supportsServo(device)
  )
    reason = 'Servo positioning unavailable';
  else if (
    isLightControlType(control?.type) &&
    control &&
    (device?.lightBlocked || lightConflict(control, controls, devices, hubs))
  )
    reason = 'Light is managed by an active sensor control';
  return {
    control,
    device,
    available: !reason,
    reason,
    subscription,
    error: issues.get(id),
  };
}

// Provide direction-aware motor state and a guarded command function.
export function useMotorControl(id: string) {
  const send = useSetControlSpeed();
  const status = useControlStatus(id);
  const pendingSpeeds = usePendingSpeeds();
  const [failure, setFailure] = useState<unknown>(null);
  const owner = useRef({}).current;
  const uuid = status.control?.uuid;
  const port = status.control?.port;
  const connectionId = status.device?.connectionId;
  const direction = motorDirection(status.control);
  const pending =
    uuid && port && connectionId !== undefined
      ? pendingSpeeds.get(connectionKey({ uuid, port, connectionId }))
      : undefined;
  // Keep the handle on the requested speed while Bluetooth feedback catches up.
  const physicalSpeed = pending ?? status.device?.commands.speed ?? 0;
  // Send an owned motor command and retain any resulting failure.
  const command = useCallback(
    async (speed: number, release = false): Promise<void> => {
      setFailure(null);
      try {
        if (!uuid || !port || typeof connectionId !== 'number') {
          throw new Error('Motor control is disconnected');
        }

        await send(id, speed === 0 ? 0 : speed * direction, {
          uuid,
          port,
          connectionId,
          owner,
          release,
        });
      } catch (cause) {
        setFailure(cause);
      }
    },
    [id, send, uuid, port, connectionId, owner, direction]
  );
  return {
    command,
    speed: physicalSpeed === 0 ? 0 : physicalSpeed * direction,
    connectionId: status.device?.connectionId,
    available: status.available,
    error: failure || status.error,
  };
}

export function usePositionControl(id: string) {
  const status = useControlStatus(id);
  const states = usePositionStates();
  const calibrate = useCalibrateControl();
  const position = useSetControlPosition();
  const speed = useSetControlSpeed();
  const [failure, setFailure] = useState<unknown>(null);
  const { control } = status;
  const connectionId = status.device?.connectionId;
  const key =
    control && connectionId !== undefined
      ? connectionKey({ uuid: control.uuid, port: control.port, connectionId })
      : null;
  const state = key ? states.get(key) : undefined;
  const run = async (action: () => Promise<unknown>) => {
    setFailure(null);
    try {
      await action();
    } catch (cause) {
      setFailure(cause);
    }
  };
  return {
    state,
    available: status.available && supportsServo(status.device),
    ready: status.available && state?.stage === 'ready',
    error: failure || status.error || state?.error,
    calibrate: () => run(() => calibrate(id)),
    move: (fraction: number) => run(() => position(id, fraction)),
    stop: () => run(() => speed(id, 0)),
  };
}
