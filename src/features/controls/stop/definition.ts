import type { ControlDefinition } from '../shared/types';
import { keyDefaults } from '../shared/shortcuts';
import { motors } from '../shared/devices';
import { squareSizes } from '../shared/sizes';
import shortcutFields from './shortcuts';

const stop: ControlDefinition<'stop'> = {
  label: 'Stop',
  defaults: keyDefaults(shortcutFields),
  motor: true,
  devices: motors,
  sizes: squareSizes,
  shortcutFields,
};

export default stop;
