import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import Arrows, { ArrowsFace } from './Control';
import Config from './Config';

// Render the arrows' non-interactive preview.
function Preview() {
  return <ArrowsFace preview />;
}

export default defineControlUI('arrows', { Widget: Arrows, Config, Preview });
