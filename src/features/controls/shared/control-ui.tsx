import React from 'react';
import type {
  Control,
  ControlOf,
  ControlType,
  DeviceInfo,
} from '../../../core/types';
import type { ControlConfigProps } from './types';

type ControlUI<K extends ControlType> = {
  Widget: React.ComponentType<{ control: ControlOf<K>; device: DeviceInfo }>;
  Config: React.ComponentType<ControlConfigProps> | null;
  Preview: React.ComponentType;
};

export type ControlUIModule<K extends ControlType> = {
  type: K;
  Config: ControlUI<K>['Config'];
  Preview: ControlUI<K>['Preview'];
  render: (control: Control, device: DeviceInfo) => React.ReactNode;
};

// Connect a control's typed widget, settings and preview to the shared shell.
export function defineControlUI<K extends ControlType>(
  type: K,
  { Widget, Config, Preview }: ControlUI<K>
): ControlUIModule<K> {
  // Reject mismatched records before rendering a type-specific widget.
  function render(control: Control, device: DeviceInfo): React.ReactNode {
    if (control.type !== type) throw new Error(`Expected ${type} control`);
    return <Widget control={control as ControlOf<K>} device={device} />;
  }
  return { type, Config, Preview, render };
}
