import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import { PowerFace } from '../shared/light/Control';
import Power from './Control';

// Render the power control's non-interactive preview.
function Preview() {
  return <PowerFace />;
}

export default defineControlUI('power', {
  Widget: Power,
  Config: null,
  Preview,
});
