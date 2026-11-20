import { ledCapabilities } from '../../../core/leds';
import type { ControlDefinition } from '../shared/types';
import { lightDevices } from '../shared/devices';
import { colorSizes } from '../shared/sizes';

// Require a supported color output for palette controls.
function isCompatible({
  type,
  hubType,
}: Parameters<NonNullable<ControlDefinition<'palette'>['isCompatible']>>[0]) {
  const capabilities = ledCapabilities(type.num, hubType);
  return Boolean(capabilities && capabilities.color !== null);
}

const palette: ControlDefinition<'palette'> = {
  label: 'Color palette',
  defaults: {},
  devices: lightDevices,
  sizes: colorSizes,
  shortcutFields: [],
  isCompatible,
};

export default palette;
