import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import controlOptions from '../shared/options';
import Tilt from './Control';
import Config from './Config';

// Render a representative tilt reading without a connected device.
function Preview() {
  return (
    <Tilt
      control={{ w: 1, options: controlOptions('tilt') }}
      device={{ events: { tilt: [-15, 20] } }}
    />
  );
}

export default defineControlUI('tilt', { Widget: Tilt, Config, Preview });
