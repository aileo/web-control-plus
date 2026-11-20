import React from 'react';
import { defineControlUI } from '../shared/control-ui';
import { PaletteFace } from '../shared/light/Control';
import Palette from './Control';

// Render the palette's non-interactive preview.
function Preview() {
  return <PaletteFace />;
}

export default defineControlUI('palette', {
  Widget: Palette,
  Config: null,
  Preview,
});
