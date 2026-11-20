import React from 'react';
import type { ControlType } from './types';
import type { ControlConfigProps } from './shared/types';
import controlUI from './ui';

// Select the settings fields owned by a control type.
export default function ControlConfigFields({
  type,
  ...props
}: ControlConfigProps & { type: ControlType }) {
  if (!Object.hasOwn(controlUI, type)) return null;
  const { Config } = controlUI[type];
  return Config ? <Config {...props} /> : null;
}
