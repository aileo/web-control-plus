import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import Stop, { StopFace } from './Control';

// Render the stop control's non-interactive preview.
function Preview() {
  return <StopFace preview />;
}

export default defineControlUI('stop', { Widget: Stop, Config: null, Preview });
