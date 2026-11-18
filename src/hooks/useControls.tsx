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
  controlShortcuts,
  normalizeShortcutKey,
  shortcutLabel,
  isCompatible,
  isLightControlType,
  motorDirection,
} from '../core/controlTypes';
import {
  boardOccupancy,
  canPlace,
  findSpace,
  isSupportedSize,
} from '../core/control-layout';
import type {
  BoardOccupant,
  Control,
  ControlType,
  DeviceInfo,
  HubInfo,
  Rect,
  SensorTarget,
} from '../core/types';
import logger from '../utils/logger';
import { ledCapabilities, type LightChanges } from '../core/leds';
import contextHook from './contextHook';
import { useHubs } from './useHubs';
import useHelpPreference from './useHelpPreference';
import {
  useDevices,
  useIsDeviceCurrent,
  useSetDeviceSpeed,
  useSetDeviceLight,
  useSubscribeDevice,
  useUnsubscribeDevice,
} from './useDevices';

type DeviceMap = Map<string, Map<string, DeviceInfo>>;
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
type ShortcutEntry = ReturnType<typeof controlShortcuts>[number];
type KeyPressEntry = ShortcutEntry & {
  id: string;
  target: ControlTarget;
  device: DeviceInfo;
  owner: object;
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
  intendedSpeeds: Map<
    string,
    { target: ControlTarget; speed: number; owner?: object }
  >;
  keyPresses: Map<string, KeyPressEntry[]>;
  locks: Set<string>;
};
type ControlContextValue = {
  controls: Map<string, Control>;
  occupancy: ReadonlyMap<string, BoardOccupant>;
  instructions: boolean;
  dismissInstructions: () => void;
  helpPreference: ReturnType<typeof useHelpPreference>;
  error: unknown;
  issues: Map<string, unknown>;
  sensorStates: Map<string, SensorState>;
  pendingSpeeds: Map<string, number>;
  add: (input: ControlInput) => Promise<Control>;
  update: (id: string, changes: ControlChanges) => Promise<Control>;
  remove: (id: string) => Promise<void>;
  speed: (
    id: string,
    speed: number,
    expected?: ExpectedMotorTarget
  ) => Promise<void | undefined>;
  light: (
    id: string,
    changes: LightChanges,
    expected?: ControlTarget
  ) => Promise<void>;
  retry: () => void;
  clearError: () => void;
};

const controlsContext = createContext<ControlContextValue | null>(null);
const editableSelector =
  'input, textarea, select, ' +
  '[contenteditable]:not([contenteditable="false"])';
function targetIsEditable(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(editableSelector));
}

function targetIsNativeButton(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('button, a[href], [role="button"]'))
  );
}
const connectionKey = ({ uuid, port, connectionId }: ControlTarget): string =>
  JSON.stringify([uuid, port, connectionId]);
const subscriptionKey = (target: SensorTarget): string =>
  JSON.stringify([target.uuid, target.port, target.connectionId, target.mode]);

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

export function ControlsProvider({ children }: PropsWithChildren) {
  const hubs = useHubs();
  const devices = useDevices();
  const setDeviceSpeed = useSetDeviceSpeed();
  const setDeviceLight = useSetDeviceLight();
  const subscribe = useSubscribeDevice();
  const unsubscribe = useUnsubscribeDevice();
  const isCurrent = useIsDeviceCurrent();
  const [controls, setControls] = useState<Map<string, Control>>(
    () => new Map()
  );
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
    intendedSpeeds: new Map(),
    keyPresses: new Map(),
    locks: new Set(),
  });
  const dismissInstructions = useCallback(() => {
    latest.current.instructions = false;
    setInstructions(false);
  }, []);
  const occupancy = useMemo(
    () => boardOccupancy(controls, instructions),
    [controls, instructions]
  );

  const commit = useCallback((next: Map<string, Control>) => {
    records.current = next;
    setControls(next);
    setIssues((previous) => {
      if ([...previous.keys()].every((id) => next.has(id))) return previous;
      return new Map([...previous].filter(([id]) => next.has(id)));
    });
  }, []);

  const report = useCallback((cause: unknown, id?: string | null) => {
    logger.error('Control action failed', cause);
    if (!life.current?.mounted) return;
    setError(cause);
    if (id) setIssues((previous) => new Map(previous).set(id, cause));
  }, []);

  const targetIsCurrent = useCallback(
    (target: ControlTarget) =>
      isCurrent(target.uuid, target.port, target.connectionId),
    [isCurrent]
  );

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

  const reconcile = useCallback(
    (current: ControlLifecycle) => {
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

  const queueSpeed = useCallback(
    (
      target: ControlTarget,
      speed: number,
      owner?: object
    ): Promise<void | undefined> => {
      const { current } = life;
      const key = connectionKey(target);
      if (speed === 0) {
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
        activeStop &&
        activeStop.ticket === current.tickets.get(key)
      ) {
        return activeStop.pending;
      }
      const ticket = (current.tickets.get(key) || 0) + 1;
      current.tickets.set(key, ticket);
      current.intendedSpeeds.set(key, { target, speed, owner });
      if (current.mounted)
        setPendingSpeeds((previous) => new Map(previous).set(key, speed));
      if (speed !== 0) current.activeMotors.set(key, target);
      const send = async (): Promise<void | undefined> => {
        if (!current.mounted || current.tickets.get(key) !== ticket) return;
        if (!targetIsCurrent(target)) throw new Error('Motor disconnected');
        await setDeviceSpeed(
          target.uuid,
          target.port,
          speed,
          target.connectionId
        );
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
      intendedSpeeds: new Map(),
      keyPresses: new Map(),
      locks: new Set(),
    };
    life.current = current;
    const stopMotors = () => {
      current.activeMotors.forEach((target, key) => {
        if (!targetIsCurrent(target)) current.activeMotors.delete(key);
        else queueSpeed(target, 0).catch(report);
      });
    };
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
  }, [devices, targetIsCurrent]);

  useEffect(() => {
    const next = new Map(
      [...records.current].filter(([, control]) => hubs.has(control.uuid))
    );
    if (next.size !== records.current.size) commit(next);
  }, [hubs, commit]);

  const actions = useMemo<
    Pick<
      ControlContextValue,
      'add' | 'update' | 'remove' | 'speed' | 'light' | 'retry' | 'clearError'
    >
  >(() => {
    async function execute<T>(
      id: string | null,
      action: (ensureCurrent: () => void) => T | Promise<T>
    ): Promise<T> {
      try {
        const { current } = life;
        const ensureCurrent = (): void => {
          if (!current.mounted || current !== life.current) {
            throw new Error('ControlsProvider is not mounted');
          }
        };
        ensureCurrent();
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

    function getControl(id: string): Control {
      const control = records.current.get(id);
      if (!control) throw new Error('This control no longer exists');
      return control;
    }

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
          boardOccupancy(records.current, latest.current.instructions),
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
      const bindings = new Map<
        string,
        { binding: ShortcutEntry; title: string }
      >();
      const others = [...records.current.values()].filter(
        (other) =>
          other.id !== excludeId &&
          other.uuid === control.uuid &&
          other.port === control.port
      );
      [...others, validated].forEach((other) => {
        controlShortcuts(other).forEach((binding) => {
          const previous = bindings.get(binding.key);
          if (
            previous &&
            (previous.binding.action !== binding.action ||
              previous.binding.delta !== binding.delta ||
              previous.binding.speed !== binding.speed ||
              previous.binding.stopOnRelease !== binding.stopOnRelease)
          ) {
            throw new Error(
              `Key "${shortcutLabel(binding.key)}" conflicts with ` +
                `${previous.title}: ${previous.binding.label} ` +
                `on port ${control.port}`
            );
          }
          bindings.set(binding.key, { binding, title: other.title });
        });
      });
      return validated;
    }

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
      }
    }

    return {
      add: (input: ControlInput) =>
        execute(null, () => {
          const definition = controlTypes[input.type];
          const size = {
            w: input.w ?? definition.sizes[0].w,
            h: input.h ?? definition.sizes[0].h,
          };
          if (!isSupportedSize(input.type, size))
            throw new Error('Unsupported control size');
          getTarget(input);
          const position = findSpace(
            boardOccupancy(records.current, latest.current.instructions),
            size
          );
          if (!position)
            throw new Error('Board full: no space for this control size');
          serial.current += 1;
          const control = validate({
            id: `control-${serial.current}`,
            type: input.type,
            title: input.title ?? definition.label,
            uuid: input.uuid,
            port: input.port,
            ...position,
            options: input.options,
          });
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
          if (speed !== 0 && document.visibilityState === 'hidden') {
            throw new Error(
              'Motor controls are paused while this page is hidden'
            );
          }
          const target = getTarget(control);
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
  }, [commit, queueSpeed, report, targetIsCurrent, setDeviceLight]);

  useEffect(() => {
    const { current } = life;
    const release = (entries: KeyPressEntry[], force = false): void => {
      entries.forEach(({ id, target, stopOnRelease, owner, action }) => {
        const control = records.current.get(id);
        if (
          !action &&
          (force || stopOnRelease) &&
          control?.uuid === target.uuid &&
          control?.port === target.port &&
          targetIsCurrent(target) &&
          current.intendedSpeeds.get(connectionKey(target))?.owner === owner
        ) {
          queueSpeed(target, 0).catch((cause) => report(cause, id));
        }
      });
    };
    const down = (event: KeyboardEvent): void => {
      const key = normalizeShortcutKey(event.key);
      if (!key || event.repeat) return;
      const token = event.code || key;
      if (current.keyPresses.has(token)) return;
      current.keyPresses.set(token, []);
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        document.querySelector(
          '[role="dialog"], [role="menu"], [role="listbox"]'
        ) ||
        targetIsEditable(event.target) ||
        ([' ', 'Enter'].includes(key) && targetIsNativeButton(event.target))
      )
        return;
      const matches = new Map<string, KeyPressEntry>();
      records.current.forEach((control) => {
        const binding = controlShortcuts(control).find(
          (item) => item.key === key
        );
        const device = latest.current.devices
          .get(control.uuid)
          ?.get(control.port);
        if (
          !binding ||
          !latest.current.hubs.get(control.uuid)?.online ||
          !device?.connected ||
          typeof device.connectionId !== 'number' ||
          !isCompatible(control.type, device)
        )
          return;
        const target = {
          uuid: control.uuid,
          port: control.port,
          connectionId: device.connectionId,
        };
        if (!targetIsCurrent(target)) return;
        matches.set(connectionKey(target), {
          ...binding,
          id: control.id,
          target,
          device,
          owner: {},
        });
      });
      if (!matches.size) return;
      event.preventDefault();
      const entries = [...matches.values()];
      current.keyPresses.set(token, entries);
      entries.forEach(({ id, target, device, speed, delta, owner, action }) => {
        if (action) {
          actions.light(id, { on: action === 'on' }, target).catch(() => {
            // The action already reports its failure to the control and board.
          });
          return;
        }
        const intended =
          current.intendedSpeeds.get(connectionKey(target))?.speed ??
          device.commands.speed ??
          0;
        const next =
          typeof delta === 'number'
            ? Math.max(-100, Math.min(100, intended + delta))
            : (speed ?? 0);
        actions.speed(id, next, { ...target, owner }).catch(() => {
          // The action already publishes its failure to the control and board.
        });
      });
    };
    const up = (event: KeyboardEvent): void => {
      const token = event.code || normalizeShortcutKey(event.key);
      if (!token) return;
      const entries = current.keyPresses.get(token);
      if (!entries) return;
      current.keyPresses.delete(token);
      release(entries);
    };
    const cancel = (): void => {
      const entries = [...current.keyPresses.values()].flat();
      current.keyPresses.clear();
      release(entries, true);
    };
    const focus = (): void => {
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [role="listbox"]'
        ) ||
        document.activeElement?.closest(editableSelector)
      ) {
        release(
          [...current.keyPresses.values()]
            .flat()
            .filter((entry) => entry.stopOnRelease)
        );
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', cancel);
    document.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('focusin', focus);
      current.keyPresses.clear();
    };
  }, [actions, queueSpeed, report, targetIsCurrent]);

  const value = useMemo<ControlContextValue>(
    () => ({
      controls,
      occupancy,
      instructions,
      dismissInstructions,
      helpPreference,
      error,
      issues,
      sensorStates,
      pendingSpeeds,
      ...actions,
    }),
    [
      controls,
      occupancy,
      instructions,
      dismissInstructions,
      helpPreference,
      error,
      issues,
      sensorStates,
      pendingSpeeds,
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
export const useBoardOccupancy = hookFactory('occupancy');
export const useBoardInstructions = hookFactory('instructions');
export const useDismissInstructions = hookFactory('dismissInstructions');
export const useHelpVisibilityPreference = hookFactory('helpPreference');
export const useControl = (id: string): Control | undefined =>
  useControls().get(id);
export const useControlsError = hookFactory('error');
export const useClearControlsError = hookFactory('clearError');
export const useAddControl = hookFactory('add');
export const useUpdateControl = hookFactory('update');
export const useRemoveControl = hookFactory('remove');
export const useSetControlSpeed = hookFactory('speed');
export const useSetControlLight = hookFactory('light');
export const useRetryControls = hookFactory('retry');
const useIssues = hookFactory('issues');
const useSensorStates = hookFactory('sensorStates');
const usePendingSpeeds = hookFactory('pendingSpeeds');

export function useControlStatus(id: string) {
  const control = useControl(id);
  const controls = useControls();
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
