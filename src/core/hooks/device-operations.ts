import { CONSTS } from '../clients/lego';
import type { LightSelection, RawDevice, RawHub } from '../types';
import type { LightChanges } from '../leds';

export type LightRequest = { changes: LightChanges; guard?: () => void };

export type DeviceEntry = {
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

// Unsubscribe a device mode using the hub family's API signature.
export function unsubscribeDeviceMode(
  hub: RawHub,
  device: RawDevice,
  mode: number
): Promise<void> | void {
  // WeDo includes device type; LPF2 identifies a mode with two arguments.
  return hub.type === CONSTS.HubType.WEDO2_SMART_HUB
    ? hub.unsubscribe(device.portId, device.type, mode)
    : hub.unsubscribe(device.portId, mode);
}

// Select the supported motor speed command for a device and hub.
export function motorCommand(
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

// Serialize device operations and prevent brightness coalescing across them.
export function queueDeviceOperation(
  entry: DeviceEntry,
  operation: () => Promise<void> | void
): Promise<void> {
  // Any intervening operation is a barrier to brightness coalescing.
  entry.queuedBrightness = null;
  const pending = (entry.pendingOperation || Promise.resolve()).then(
    operation,
    operation
  );
  entry.pendingOperation = pending;
  // Clear the queue only after this operation is still the latest one.
  const clean = () => {
    if (entry.pendingOperation === pending) entry.pendingOperation = null;
  };
  pending.then(clean, clean);
  return pending;
}
