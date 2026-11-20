import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import SliderFace from '../shared/SliderFace';
import Slider from './Control';
import Config from './Config';

// Render the slider's non-interactive preview.
function Preview() {
  return <SliderFace />;
}

export default defineControlUI('slider', { Widget: Slider, Config, Preview });
