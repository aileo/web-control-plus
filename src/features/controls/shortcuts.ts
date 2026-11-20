import type { Control } from '../../core/types';
import type { Shortcut } from './shared/types';
import { controlTypes } from './definitions';
import {
  generateShortcuts,
  normalizeShortcutKey,
  shortcutLabel,
} from './shared/shortcuts';

export { normalizeShortcutKey, shortcutLabel };

// Resolve a control's configured keyboard bindings into actions.
export function controlShortcuts(control: Control): Shortcut[] {
  const definition = controlTypes[control.type];
  const direction = definition.motorDirection?.(control) ?? 1;
  return generateShortcuts(control, definition.shortcutFields, direction);
}

// Reject conflicting keyboard bindings across the supplied controls.
export function validateControlShortcuts(controls: Iterable<Control>): void {
  const bindings = new Map<string, { binding: Shortcut; title: string }>();
  Array.from(controls).forEach((control) => {
    controlShortcuts(control).forEach((binding) => {
      const key = JSON.stringify([control.uuid, control.port, binding.key]);
      const previous = bindings.get(key);
      if (
        previous &&
        (previous.binding.action !== binding.action ||
          previous.binding.delta !== binding.delta ||
          previous.binding.speed !== binding.speed ||
          previous.binding.stopOnRelease !== binding.stopOnRelease)
      ) {
        throw new Error(
          `Key "${shortcutLabel(binding.key)}" conflicts with ` +
            `${previous.title}: ${previous.binding.label} ` +
            `on port ${control.port}`
        );
      }
      bindings.set(key, { binding, title: control.title });
    });
  });
}
