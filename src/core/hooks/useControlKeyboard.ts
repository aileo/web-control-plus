import { useEffect, type MutableRefObject } from 'react';
import type { LightChanges } from '../leds';
import {
  controlShortcuts,
  isCompatible,
  normalizeShortcutKey,
} from '../controls';
import type { Control, DeviceInfo, HubInfo } from '../types';

type DeviceMap = Map<string, Map<string, DeviceInfo>>;
type ControlTarget = { uuid: string; port: string; connectionId: number };
export type KeyPressEntry = ReturnType<typeof controlShortcuts>[number] & {
  id: string;
  target: ControlTarget;
  device: DeviceInfo;
  owner: object;
};
type InputLifecycle = {
  keyPresses: Map<string, KeyPressEntry[]>;
  intendedSpeeds: Map<
    string,
    { target: ControlTarget; speed: number; owner?: object }
  >;
};
type KeyboardActions = {
  speed: (
    id: string,
    speed: number,
    expected?: ControlTarget & { owner?: object }
  ) => Promise<void | undefined>;
  light: (
    id: string,
    changes: LightChanges,
    expected?: ControlTarget
  ) => Promise<void>;
};

const editableSelector =
  'input, textarea, select, ' +
  '[contenteditable]:not([contenteditable="false"])';
const dialogSelector = '[role="dialog"], [role="menu"], [role="listbox"]';

// Check whether keyboard input originated in an editable element.
function targetIsEditable(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(editableSelector));
}

// Check whether a target has native button-like keyboard behavior.
function targetIsNativeButton(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('button, a[href], [role="button"]'))
  );
}

// Build a stable key for one device connection.
function connectionKey({ uuid, port, connectionId }: ControlTarget): string {
  return JSON.stringify([uuid, port, connectionId]);
}

// Route board keyboard shortcuts to the currently connected device controls.
export function useControlKeyboard({
  actions,
  controlsForBoard,
  latest,
  life,
  queueSpeed,
  records,
  report,
  selectedRef,
  targetIsCurrent,
}: {
  actions: KeyboardActions;
  controlsForBoard: (id: string) => Map<string, Control>;
  latest: MutableRefObject<{
    hubs: Map<string, HubInfo>;
    devices: DeviceMap;
  }>;
  life: MutableRefObject<InputLifecycle>;
  queueSpeed: (
    target: ControlTarget,
    speed: number
  ) => Promise<void | undefined>;
  records: MutableRefObject<Map<string, Control>>;
  report: (cause: unknown, id?: string | null) => void;
  selectedRef: MutableRefObject<string>;
  targetIsCurrent: (target: ControlTarget) => boolean;
}): void {
  useEffect(() => {
    const { current } = life;
    // Stop owned motors when a pressed shortcut is released or cancelled.
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
    // Resolve and dispatch matching shortcuts on keydown.
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
        document.querySelector(dialogSelector) ||
        targetIsEditable(event.target) ||
        ([' ', 'Enter'].includes(key) && targetIsNativeButton(event.target))
      )
        return;
      const matches = new Map<string, KeyPressEntry>();
      controlsForBoard(selectedRef.current).forEach((control) => {
        const binding = controlShortcuts(control).find(
          (item) => item.key === key
        );
        const device = latest.current.devices
          .get(control.uuid)
          ?.get(control.port);
        if (
          !binding ||
          ((control.type === 'slider' || control.type === 'arrows') &&
            control.options.mode === 'servo' &&
            binding.speed !== 0) ||
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
          const isOn = device.commands.light?.on;
          const on = action === 'on' || (action === 'toggle' && !isOn);
          actions.light(id, { on }, target).catch(() => {
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
    // Release the actions associated with a matching keyup.
    const up = (event: KeyboardEvent): void => {
      const token = event.code || normalizeShortcutKey(event.key);
      if (!token) return;
      const entries = current.keyPresses.get(token);
      if (!entries) return;
      current.keyPresses.delete(token);
      release(entries);
    };
    // Cancel every pressed shortcut when the window loses focus.
    const cancel = (): void => {
      const entries = [...current.keyPresses.values()].flat();
      current.keyPresses.clear();
      release(entries, true);
    };
    // Release active shortcuts when the board requests an input reset.
    const releaseBoard = (): void => {
      const entries = [...current.keyPresses.values()].flat();
      current.keyPresses.forEach((_, token) =>
        current.keyPresses.set(token, [])
      );
      release(entries);
    };
    // Stop release-bound actions when focus enters a dialog or editor.
    const focus = (): void => {
      if (
        document.querySelector(dialogSelector) ||
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
    window.addEventListener('board-input-release', releaseBoard);
    document.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('board-input-release', releaseBoard);
      document.removeEventListener('focusin', focus);
      current.keyPresses.clear();
    };
  }, [
    actions,
    controlsForBoard,
    latest,
    life,
    queueSpeed,
    records,
    report,
    selectedRef,
    targetIsCurrent,
  ]);
}
