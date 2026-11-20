import type { ShortcutField } from '../shared/types';

const shortcutFields = [
  { option: 'forwardKey', label: 'Forward', direction: 1 },
  { option: 'stopKey', label: 'Stop', speed: 0 },
  { option: 'backwardKey', label: 'Backward', direction: -1 },
] as const satisfies readonly ShortcutField[];

export default shortcutFields;
