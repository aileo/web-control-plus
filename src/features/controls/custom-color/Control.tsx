import React from 'react';
import type { ControlOf, DeviceInfo } from '../../../core/types';
import Light from '../shared/light/Control';

// Render custom-color settings with shared light behavior.
export default function CustomColor({
  control,
  device,
}: {
  control: ControlOf<'customColor'>;
  device: DeviceInfo;
}) {
  return <Light control={control} device={device} />;
}
