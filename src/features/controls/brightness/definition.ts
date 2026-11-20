import { ledCapabilities } from '../../../core/leds';
import type { ControlDefinition } from '../shared/types';
import { lightDevices } from '../shared/devices';
import { sliderSizes } from '../shared/sizes';

// Require a supported brightness step for brightness controls.
function isCompatible({
  type,
  hubType,
}: Parameters<
  NonNullable<ControlDefinition<'brightness'>['isCompatible']>
>[0]) {
  const capabilities = ledCapabilities(type.num, hubType);
  return Boolean(capabilities && capabilities.step !== null);
}

const brightness: ControlDefinition<'brightness'> = {
  label: 'Brightness',
  defaults: {},
  devices: lightDevices,
  sizes: sliderSizes,
  shortcutFields: [],
  isCompatible,
};

export default brightness;
