import type { Control } from '../../../core/types';
import type { ControlDefinition } from '../shared/types';
import { keyDefaults } from '../shared/shortcuts';
import { motors } from '../shared/devices';
import { sliderSizes } from '../shared/sizes';
import shortcutFields from './shortcuts';

// Resolve the motor direction multiplier for a slider.
function motorDirection(control: Control): number {
  return control.type === 'slider' && control.options.reverseRotation ? -1 : 1;
}

// Validate settings that affect the motor slider.
function validateOptions(options: Record<string, unknown>): void {
  if (options.mode !== 'speed' && options.mode !== 'servo') {
    throw new Error('Motor mode is not supported');
  }
  if (typeof options.resetOnRelease !== 'boolean') {
    throw new Error('Invalid reset-on-release setting');
  }
  if (typeof options.reverseRotation !== 'boolean') {
    throw new Error('Invalid reverse rotation setting');
  }
}

const slider: ControlDefinition<'slider'> = {
  label: 'Motor slider',
  defaults: {
    mode: 'speed',
    resetOnRelease: false,
    reverseRotation: false,
    ...keyDefaults(shortcutFields),
  },
  motor: true,
  devices: motors,
  sizes: sliderSizes,
  shortcutFields,
  motorDirection,
  validateOptions,
};

export default slider;
