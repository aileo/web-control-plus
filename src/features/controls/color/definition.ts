import { CONSTS } from '../../../core/clients/lego';
import type { ControlDefinition } from '../shared/types';
import { squareSizes } from '../shared/sizes';

const { DeviceType, HubType } = CONSTS;

// Select the color sensor mode for its hardware and hub combination.
function mode(type: number, hubType?: number): number {
  if (type === DeviceType.COLOR_DISTANCE_SENSOR) {
    return hubType === HubType.WEDO2_SMART_HUB ? 0 : 8;
  }
  return type === DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR ? 1 : 0;
}

// Validate the configured color stability interval.
function validateOptions(options: Record<string, unknown>): void {
  if (
    typeof options.stability !== 'number' ||
    ![0, 150, 400].includes(options.stability)
  ) {
    throw new Error('Choose a supported color stability');
  }
}

const color: ControlDefinition<'color'> = {
  label: 'Color',
  defaults: { stability: 0 },
  devices: [
    DeviceType.COLOR_DISTANCE_SENSOR,
    DeviceType.TECHNIC_COLOR_SENSOR,
    DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR,
  ],
  sizes: squareSizes,
  mode,
  shortcutFields: [],
  validateOptions,
};

export default color;
