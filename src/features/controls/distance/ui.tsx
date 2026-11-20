import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import Distance from './Control';
import Config from './Config';
import definition from './definition';

// Render a representative distance reading without a connected device.
function Preview() {
  return (
    <Distance
      control={{ w: 1 }}
      device={{
        type: { num: definition.devices[0] },
        events: { distance: [120] },
      }}
    />
  );
}

export default defineControlUI('distance', {
  Widget: Distance,
  Config,
  Preview,
});
