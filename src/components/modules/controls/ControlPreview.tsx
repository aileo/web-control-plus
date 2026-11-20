import React from 'react';
import { Box } from '@mui/material';
import { tileSx } from '../../../theme/lego';
import controlUI from '../../../features/controls/ui';
import type { ControlType } from '../../../core/types';

// Render a static preview for a control type and size.
function ControlPreview({
  type,
  hubColor,
}: {
  type: ControlType;
  hubColor?: string;
}) {
  if (!Object.hasOwn(controlUI, type)) {
    throw new Error('Unknown control preview');
  }
  const { Preview } = controlUI[type];
  return (
    <Box
      aria-hidden="true"
      data-control-preview={type}
      sx={{
        ...tileSx(hubColor),
        width: 176,
        maxWidth: '100%',
        height: 136,
        p: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Preview />
    </Box>
  );
}

export default ControlPreview;
