import React from 'react';
import { Box } from '@mui/material';
import { studSx, tileSx } from '../../../theme/lego';
import type { Size as TileSize } from '../../../core/types';

export function SizePreview({
  w,
  h,
  hubColor,
}: TileSize & { hubColor?: string }) {
  const unit = 144 / Math.max(w, h);
  return (
    <Box
      aria-hidden="true"
      data-size-preview={`${w}x${h}`}
      sx={{
        ...tileSx(hubColor),
        width: w * unit,
        height: h * unit,
        display: 'grid',
        gridTemplateColumns: `repeat(${w}, 1fr)`,
        gridTemplateRows: `repeat(${h}, 1fr)`,
      }}
    >
      {Array.from({ length: w * h }, (_, index) => (
        <Box
          key={index}
          data-stud
          sx={{ ...studSx, fontSize: Math.max(4, Math.min(12, unit * 0.12)) }}
        />
      ))}
    </Box>
  );
}

function Size({ w, h }: TileSize) {
  return (
    <>
      {w} {w === 1 ? 'column' : 'columns'} x {h} {h === 1 ? 'row' : 'rows'}
    </>
  );
}

export default Size;
