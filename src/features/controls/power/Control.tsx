import React from 'react';
import type { ControlOf, DeviceInfo } from '../../../core/types';
import Light from '../shared/light/Control';

// Render power settings with shared light behavior.
export default function Power({
  control,
  device,
}: {
  control: ControlOf<'power'>;
  device: DeviceInfo;
}) {
  return <Light control={control} device={device} />;
}
