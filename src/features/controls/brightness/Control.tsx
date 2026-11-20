import React from 'react';
import type { ControlOf, DeviceInfo } from '../../../core/types';
import Light from '../shared/light/Control';

// Render brightness settings with shared light behavior.
export default function Brightness({
  control,
  device,
}: {
  control: ControlOf<'brightness'>;
  device: DeviceInfo;
}) {
  return <Light control={control} device={device} />;
}
