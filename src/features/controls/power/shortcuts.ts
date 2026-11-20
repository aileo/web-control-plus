import type { ShortcutField } from '../shared/types';

const shortcutFields = [
  { option: 'onKey', label: 'On', action: 'on' },
  { option: 'offKey', label: 'Off', action: 'off' },
] as const satisfies readonly ShortcutField[];

export default shortcutFields;
