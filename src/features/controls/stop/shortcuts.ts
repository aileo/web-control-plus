import type { ShortcutField } from '../shared/types';

const shortcutFields = [
  { option: 'stopKey', label: 'Stop', speed: 0 },
] as const satisfies readonly ShortcutField[];

export default shortcutFields;
