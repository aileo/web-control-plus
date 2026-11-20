import React from 'react';

import { Box } from '@mui/material';
import Main from './Main';

// Wrap the main page in the application's semantic content region.
export default function PageWrapper() {
  return (
    <Box
      component="main"
      sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}
    >
      <Main />
    </Box>
  );
}
