import type { ShortcutField } from '../shared/types';

const shortcutFields = [
  { option: 'increase10Key', label: 'Increase by 10', delta: 10 },
  { option: 'increase1Key', label: 'Increase by 1', delta: 1 },
  { option: 'decrease1Key', label: 'Decrease by 1', delta: -1 },
  { option: 'decrease10Key', label: 'Decrease by 10', delta: -10 },
] as const satisfies readonly ShortcutField[];

export default shortcutFields;
