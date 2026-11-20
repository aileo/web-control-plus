import type { Control } from '../../../core/types';
import type { Shortcut, ShortcutField } from './types';

// Normalize a supported keyboard shortcut key or reject it.
export function normalizeShortcutKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  if ([' ', 'Enter', 'Tab', 'Escape'].includes(key)) return null;
  if ([...key].length === 1) return key.toLowerCase();
  return [
    'Backspace',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ].includes(key)
    ? key
    : null;
}

// Format a shortcut key for display.
export const shortcutLabel = (key: string): string =>
  key === ' ' ? 'Space' : key;

// Create empty keyboard shortcut options from a control's fields.
export function keyDefaults<T extends readonly ShortcutField[]>(
  fields: T
): Record<T[number]['option'], string> {
  return Object.fromEntries(fields.map(({ option }) => [option, ''])) as Record<
    T[number]['option'],
    string
  >;
}

// Generate executable keyboard bindings from a control's shortcut fields.
export function generateShortcuts(
  control: Control,
  fields: readonly ShortcutField[],
  direction = 1
): Shortcut[] {
  return fields.flatMap((field) => {
    const key = (control.options as Record<string, unknown>)[field.option];
    if (typeof key !== 'string' || !key) return [];
    const delta =
      typeof field.delta === 'number' ? field.delta * direction : undefined;
    const speed =
      typeof field.direction === 'number' && control.type === 'arrows'
        ? field.direction * control.options.speed
        : field.speed;
    return [
      {
        key,
        label: field.label,
        action: field.action,
        delta,
        speed,
        stopOnRelease:
          typeof field.delta === 'number'
            ? control.type === 'slider' && control.options.resetOnRelease
            : Boolean(
                field.direction &&
                control.type === 'arrows' &&
                control.options.stopOnRelease
              ),
      },
    ];
  });
}
