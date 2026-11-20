import { CONSTS } from '../clients/lego';
import { ledCapabilities, lightSelection, writeLight } from '../leds';
import type { LightChanges } from '../leds';
import type { RawHub } from '../types';
import {
  queueDeviceOperation,
  type DeviceEntry,
  type LightRequest,
} from './device-operations';

// Validate, queue, and publish a light change for the active device session.
export default function runDeviceLight({
  session,
  entry,
  isCurrent,
  input,
  ensureInput,
  initial = false,
  publishLight,
  setHubColor,
}: {
  session: { hub: RawHub };
  entry: DeviceEntry;
  isCurrent: () => boolean;
  input: LightChanges;
  ensureInput?: () => void;
  initial?: boolean;
  publishLight: (session: { hub: RawHub }, entry: DeviceEntry) => void;
  setHubColor: (uuid: string, color: string, hub: RawHub) => Promise<void>;
}): Promise<void> {
  const { hub } = session;
  const step = ledCapabilities(entry.device.type, hub.type)?.step;
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
  const pending = queueDeviceOperation(entry, async () => {
    if (entry.queuedBrightness?.request === request)
      entry.queuedBrightness = null;
    const { changes, guard } = request;
    try {
      if (!isCurrent()) throw new Error('Light connection changed');
      guard?.();
      const capabilities = ledCapabilities(entry.device.type, hub.type);
      if (!capabilities) throw new Error('Device does not support lights');
      const next = lightSelection(capabilities, entry.light ?? null, changes);
      if (
        capabilities.mode !== undefined &&
        [...entry.requestedModes, ...entry.modes].some(
          (mode) => mode !== capabilities.mode
        )
      )
        throw new Error('Light is managed by an active sensor control');
      if (
        next.on !== null &&
        (next.on || Object.hasOwn(changes, 'on') || changes.brightness === 0)
      ) {
        if (capabilities.mode !== undefined && !entry.lightMode) {
          entry.lightMode = true;
          await hub.subscribe(
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
        !initial &&
        entry.device.type === CONSTS.DeviceType.HUB_LED &&
        Object.hasOwn(changes, 'color')
      ) {
        if (typeof next.color !== 'string')
          throw new Error('Hub light requires an RGB color');
        await setHubColor(hub.uuid, next.color, hub);
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
}
