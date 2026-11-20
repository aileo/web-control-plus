import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import SliderFace from '../shared/SliderFace';
import Brightness from './Control';

// Render the brightness control's non-interactive preview.
function Preview() {
  return <SliderFace speed={70} min={0} max={100} />;
}

export default defineControlUI('brightness', {
  Widget: Brightness,
  Config: null,
  Preview,
});
