import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import Color from './Control';
import Config from './Config';

// Render a representative color reading without a connected device.
function Preview() {
  return <Color control={{ w: 1 }} device={{ events: { color: [9] } }} />;
}

export default defineControlUI('color', { Widget: Color, Config, Preview });
