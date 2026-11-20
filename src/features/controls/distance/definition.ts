import { CONSTS } from '../../../core/clients/lego';
import type { ControlDefinition } from '../shared/types';
import { squareSizes } from '../shared/sizes';

const { DeviceType, HubType } = CONSTS;

export const distanceRanges: Record<number, number> = {
  [DeviceType.COLOR_DISTANCE_SENSOR]: 234,
  [DeviceType.MOTION_SENSOR]: 5100,
};

// Select the distance sensor mode required by the device.
function mode(type: number): number {
  return type === DeviceType.COLOR_DISTANCE_SENSOR ? 8 : 0;
}

// Exclude the WeDo hub's color-distance sensor mode conflict.
function isCompatible({
  type,
  hubType,
}: Parameters<NonNullable<ControlDefinition<'distance'>['isCompatible']>>[0]) {
  return !(
    type.num === DeviceType.COLOR_DISTANCE_SENSOR &&
    hubType === HubType.WEDO2_SMART_HUB
  );
}

// Validate the configured distance scale.
function validateOptions(options: Record<string, unknown>): void {
  if (
    typeof options.scale !== 'string' ||
    !['progressive', 'linear'].includes(options.scale)
  ) {
    throw new Error('Choose Progressive or Linear distance scale');
  }
}

const distance: ControlDefinition<'distance'> = {
  label: 'Distance',
  defaults: { scale: 'progressive' },
  devices: [DeviceType.COLOR_DISTANCE_SENSOR, DeviceType.MOTION_SENSOR],
  sizes: squareSizes,
  mode,
  isCompatible,
  shortcutFields: [],
  validateOptions,
};

export default distance;
