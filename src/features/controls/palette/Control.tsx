import React from 'react';
import type { ControlOf, DeviceInfo } from '../../../core/types';
import Light from '../shared/light/Control';

// Render palette settings with shared light behavior.
export default function Palette({
  control,
  device,
}: {
  control: ControlOf<'palette'>;
  device: DeviceInfo;
}) {
  return <Light control={control} device={device} />;
}
