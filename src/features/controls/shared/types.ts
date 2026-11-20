import type { Control, DeviceInfo } from '../../../core/types';
import type { ControlOptions, ControlType, Size } from '../types';

export type ShortcutField = {
  option: string;
  label: string;
  delta?: number;
  direction?: number;
  speed?: number;
  action?: 'on' | 'off';
};

export type Shortcut = {
  key: string;
  label: string;
  action?: 'on' | 'off';
  delta?: number;
  speed?: number;
  stopOnRelease: boolean;
};

export type ControlDefinition<K extends ControlType = ControlType> = {
  label: string;
  defaults: ControlOptions[K];
  devices: readonly number[];
  sizes: readonly Size[];
  motor?: boolean;
  mode?: (type: number, hubType?: number) => number;
  isCompatible?: (device: Pick<DeviceInfo, 'type' | 'hubType'>) => boolean;
  shortcutFields: readonly ShortcutField[];
  motorDirection?: (control: Control) => number;
  validateOptions?: (options: Record<string, unknown>) => void;
};

export type ControlDefinitions = {
  [K in ControlType]: ControlDefinition<K>;
};

export type ControlProposal = {
  type: ControlType;
} & Pick<
  ControlDefinition,
  'label' | 'defaults' | 'motor' | 'devices' | 'sizes' | 'mode'
>;

export type ControlConfigProps = {
  options: Record<string, string | number | boolean>;
  busy: boolean;
  setOption: (key: string, value: string | number | boolean) => void;
};
