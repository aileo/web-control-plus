import React from 'react';
import { Box } from '@mui/material';
import Control from '../controls/Control';
import type { Control as ControlRecord } from '../../../core/types';
import type { StartGesture } from '../../types';

function GridControls({
  controls,
  onGesture,
}: {
  controls: ReadonlyMap<string, ControlRecord>;
  onGesture: StartGesture;
}) {
  return [...controls.values()].map((control) => (
    <Box
      key={control.id}
      data-control-id={control.id}
      sx={{
        position: 'relative',
        zIndex: 1,
        gridColumn: `${control.x + 1} / span ${control.w}`,
        gridRow: `${control.y + 1} / span ${control.h}`,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <Control control={control} onGesture={onGesture} />
    </Box>
  ));
}

export default GridControls;
