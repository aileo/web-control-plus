import type { ControlDefinition } from '../shared/types';
import { keyDefaults } from '../shared/shortcuts';
import { motors } from '../shared/devices';
import shortcutFields from './shortcuts';

const arrowSizes = [
  { w: 1, h: 2 },
  { w: 2, h: 1 },
];

// Validate the arrow speed and release behavior.
function validateOptions(options: Record<string, unknown>): void {
  if (options.mode !== 'speed' && options.mode !== 'servo') {
    throw new Error('Motor mode is not supported');
  }
  if (typeof options.stopOnRelease !== 'boolean') {
    throw new Error('Invalid stop-on-release setting');
  }
  if (
    !Number.isInteger(options.speed) ||
    typeof options.speed !== 'number' ||
    options.speed < 1 ||
    options.speed > 100
  ) {
    throw new Error('Choose a whole-number speed between 1 and 100');
  }
}

const arrows: ControlDefinition<'arrows'> = {
  label: 'Motor arrows',
  defaults: {
    mode: 'speed',
    speed: 100,
    stopOnRelease: true,
    ...keyDefaults(shortcutFields),
  },
  motor: true,
  devices: motors,
  sizes: arrowSizes,
  shortcutFields,
  validateOptions,
};

export default arrows;
