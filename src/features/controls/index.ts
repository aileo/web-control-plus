export {
  controlTypes,
  distanceRanges,
  getControlTypes,
  isCompatible,
  isLightControlType,
  motorDirection,
  shortcutFields,
} from './definitions';
export { default as controlOptions } from './shared/options';
export {
  controlShortcuts,
  normalizeShortcutKey,
  shortcutLabel,
  validateControlShortcuts,
} from './shortcuts';
export type {
  ControlOptions,
  ControlType,
  LightControlType,
  Size,
} from './types';
export type {
  ControlConfigProps,
  ControlDefinition,
  ControlProposal,
  Shortcut,
  ShortcutField,
} from './shared/types';
