import { ledCapabilities } from '../../../core/leds';
import type { ControlDefinition } from '../shared/types';
import { lightDevices } from '../shared/devices';
import { keyDefaults } from '../shared/shortcuts';
import shortcutFields from './shortcuts';

// Require any supported light capability for power controls.
function isCompatible({
  type,
  hubType,
}: Parameters<NonNullable<ControlDefinition<'power'>['isCompatible']>>[0]) {
  return Boolean(ledCapabilities(type.num, hubType));
}

const power: ControlDefinition<'power'> = {
  label: 'On/Off',
  defaults: keyDefaults(shortcutFields),
  devices: lightDevices,
  sizes: [{ w: 1, h: 1 }],
  shortcutFields,
  isCompatible,
};

export default power;
