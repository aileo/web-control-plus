import { CONSTS } from '../../../core/clients/lego';
import type { ControlDefinition } from '../shared/types';
import { squareSizes } from '../shared/sizes';

const { DeviceType } = CONSTS;

// Configure the sensor mode used by tilt controls.
function mode(): number {
  return 0;
}

// Validate configured tilt axes and reversal factors.
function validateOptions(options: Record<string, unknown>): void {
  if (
    ![options.rollAxis, options.pitchAxis].every(
      (axis) => typeof axis === 'number' && [0, 1, 2].includes(axis)
    )
  ) {
    throw new Error('Choose an X, Y, or Z tilt axis');
  }
  if (
    ![options.rollReverseFactor, options.pitchReverseFactor].every(
      (value) => typeof value === 'number' && [1, -1].includes(value)
    )
  ) {
    throw new Error('Invalid tilt reversal');
  }
}

const tilt: ControlDefinition<'tilt'> = {
  label: 'Tilt',
  defaults: {
    rollAxis: 0,
    pitchAxis: 1,
    rollReverseFactor: 1,
    pitchReverseFactor: 1,
  },
  devices: [
    DeviceType.TILT_SENSOR,
    DeviceType.MOVE_HUB_TILT_SENSOR,
    DeviceType.TECHNIC_MEDIUM_HUB_TILT_SENSOR,
  ],
  sizes: squareSizes,
  mode,
  shortcutFields: [],
  validateOptions,
};

export default tilt;
