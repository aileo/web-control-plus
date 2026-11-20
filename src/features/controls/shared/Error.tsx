import React from 'react';
import { Typography } from '@mui/material';

// Render an error message for a control.
function Error({ error }: { error?: unknown }) {
  return error ? (
    <Typography
      role="alert"
      variant="caption"
      color="error"
      sx={{ overflowWrap: 'anywhere' }}
    >
      {typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error)}
    </Typography>
  ) : null;
}

export default Error;
