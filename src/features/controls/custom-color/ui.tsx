import React from 'react';
import { Box } from '@mui/material';
import { defineControlUI } from '../shared/control-ui';
import { CustomColorFace } from '../shared/light/CustomColor';
import CustomColor from './Control';

// Render the custom color control's non-interactive preview.
function Preview() {
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <CustomColorFace />
    </Box>
  );
}

export default defineControlUI('customColor', {
  Widget: CustomColor,
  Config: null,
  Preview,
});
