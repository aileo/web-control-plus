import type { ControlOptions, ControlType } from '../types';
import { controlTypes } from '../definitions';
import { normalizeShortcutKey } from './shortcuts';

// Validate and normalize a control's option values.
export default function controlOptions<K extends ControlType>(
  type: K,
  options: unknown = {}
): ControlOptions[K] {
  if (!Object.hasOwn(controlTypes, type)) {
    throw new Error('Unknown control type');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid control options');
  }
  const definition = controlTypes[type];
  const defaults = definition.defaults as Record<string, unknown>;
  const supplied = options as Record<string, unknown>;
  const result: Record<string, unknown> = { ...defaults, ...supplied };
  if (Object.keys(supplied).some((key) => !Object.hasOwn(defaults, key))) {
    throw new Error('Unknown control option');
  }
  definition.shortcutFields.forEach(({ option }) => {
    if (result[option] === '') return;
    const key = normalizeShortcutKey(result[option]);
    if (!key)
      throw new Error(
        'Choose a single key (Tab, Escape, Space, and Enter are reserved)'
      );
    result[option] = key;
  });
  definition.validateOptions?.(result);
  return result as ControlOptions[K];
}
