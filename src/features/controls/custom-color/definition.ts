import { ledCapabilities } from '../../../core/leds';
import type { ControlDefinition } from '../shared/types';
import { lightDevices } from '../shared/devices';
import { colorSizes } from '../shared/sizes';

// Require RGB color output for custom-color controls.
function isCompatible({
  type,
  hubType,
}: Parameters<
  NonNullable<ControlDefinition<'customColor'>['isCompatible']>
>[0]) {
  return ledCapabilities(type.num, hubType)?.color === 'rgb';
}

const customColor: ControlDefinition<'customColor'> = {
  label: 'Custom color',
  defaults: {},
  devices: lightDevices,
  sizes: colorSizes,
  shortcutFields: [],
  isCompatible,
};

export default customColor;
