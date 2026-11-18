import React from 'react';
import { Box, Stack } from '@mui/material';

import { useHubs } from '../../../hooks';
import Hub from './Hub';
import ConnectHub from './ConnectHub';

function HubList() {
  const hubs = useHubs();

  return (
    <Box>
      <Stack
        component="nav"
        aria-label="Hubs"
        direction="row"
        spacing={2}
        sx={{ minWidth: 0, alignItems: 'center' }}
      >
        <ConnectHub />
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', py: 1 }}>
          {[...hubs.values()].reverse().map((hub) => (
            <Hub key={hub.uuid} uuid={hub.uuid} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

export default HubList;
