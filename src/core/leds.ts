import { Buffer } from 'buffer';
import tinycolor from 'tinycolor2';

import { CONSTS } from './clients/lego.ts';

import { calibrateRGB } from './clients/hub-colors.ts';
import type { LightOutputDevice, LightSelection } from './types';

const { DeviceType, HubType, CommandFeedback } = CONSTS;

export type LedCapabilities = {
  color: 'rgb' | 'palette' | null;
  step: number | null;
  mode?: number;
};

export type LightChanges = {
  on?: boolean;
  color?: string | number;
  brightness?: number;
};

export const ledTypes: Record<number, LedCapabilities> = {
  [DeviceType.HUB_LED]: { color: 'rgb', step: 1 },
  [DeviceType.COLOR_DISTANCE_SENSOR]: { color: 'palette', step: null },
  [DeviceType.LIGHT]: { color: null, step: 1 },
  [DeviceType.TECHNIC_COLOR_SENSOR]: { color: null, step: 1, mode: 3 },
  [DeviceType.TECHNIC_DISTANCE_SENSOR]: { color: null, step: 1 },
  [DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX]: {
    color: 'palette',
    step: 10,
  },
};

export function ledCapabilities(
  type: number | undefined,
  hubType?: number
): LedCapabilities | null {
  if (
    type === DeviceType.COLOR_DISTANCE_SENSOR &&
    hubType === HubType.WEDO2_SMART_HUB
  )
    return null;
  return type === undefined ? null : ledTypes[type] || null;
}

export function lightSelection(
  capabilities: LedCapabilities | null,
  previous: LightSelection | null,
  changes: unknown
): LightSelection {
  if (
    !capabilities ||
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).some(
      (key) => !['on', 'color', 'brightness'].includes(key)
    )
  )
    throw new Error('Invalid light settings');
  const updated = changes as LightChanges;
  const next: LightSelection = {
    on: null,
    color: capabilities.color === 'rgb' ? '#ffffff' : 10,
    brightness: 100,
    lastBrightness: 100,
    ...previous,
  };
  if (Object.hasOwn(updated, 'on')) {
    if (typeof updated.on !== 'boolean') throw new Error('Choose On or Off');
    next.on = updated.on;
    if (next.on && next.brightness === 0) next.brightness = next.lastBrightness;
  }
  if (Object.hasOwn(updated, 'color')) {
    const { color } = updated;
    if (!capabilities.color) throw new Error('Choose a supported light color');
    if (capabilities.color === 'palette') {
      if (
        typeof color !== 'number' ||
        !Number.isInteger(color) ||
        color < 1 ||
        color > 10
      )
        throw new Error('Choose a supported light color');
    } else if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error('Choose a supported light color');
    }
    if (color === undefined) throw new Error('Choose a supported light color');
    next.color = color;
  }
  if (Object.hasOwn(updated, 'brightness')) {
    if (
      !capabilities.step ||
      typeof updated.brightness !== 'number' ||
      !Number.isInteger(updated.brightness) ||
      updated.brightness < 0 ||
      updated.brightness > 100 ||
      updated.brightness % capabilities.step !== 0
    )
      throw new Error('Choose a supported light brightness');
    next.brightness = updated.brightness;
    if (next.brightness > 0) next.lastBrightness = next.brightness;
    else if (next.on !== null) next.on = false;
  }
  return next;
}

export async function writeLight(
  device: LightOutputDevice,
  type: number,
  selection: LightSelection
): Promise<void> {
  const { on, color, brightness } = selection;
  const level = on ? brightness : 0;
  let result: number | void;
  if (type === DeviceType.HUB_LED) {
    if (typeof color !== 'string' || typeof device.setRGB !== 'function')
      throw new Error('Hub does not support RGB lights');
    const rgb = calibrateRGB(tinycolor(color).toRgb(), level);
    result = await device.setRGB(rgb.r, rgb.g, rgb.b);
  } else {
    let mode: number;
    let values: number[];
    if (type === DeviceType.COLOR_DISTANCE_SENSOR) {
      mode = 5;
      values = [on && typeof color === 'number' ? color : 0];
    } else if (type === DeviceType.LIGHT) {
      mode = 0;
      values = [level];
    } else if (type === DeviceType.TECHNIC_COLOR_SENSOR) {
      mode = 3;
      values = Array(3).fill(level);
    } else if (type === DeviceType.TECHNIC_DISTANCE_SENSOR) {
      mode = 5;
      values = Array(4).fill(level);
    } else if (type === DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX) {
      if (typeof color !== 'number')
        throw new Error('Choose a supported matrix color');
      mode = 2;
      values = Array(9).fill(level ? color + (level / 10) * 16 : 0);
    } else throw new Error('Device does not support lights');
    result = await device.writeDirect(mode, Buffer.from(values));
  }
  const failedFeedback = new Set<number>([
    CommandFeedback.EXECUTION_DISCARDED,
    CommandFeedback.TRANSMISSION_DISCARDED,
    CommandFeedback.FEEDBACK_MISSING,
  ]);
  if (typeof result === 'number' && failedFeedback.has(result))
    throw new Error('Light command was not completed');
}
