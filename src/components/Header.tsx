import React from 'react';
import { AppBar, Box, Toolbar, Typography } from '@mui/material';
import FullscreenButton from './FullscreenButton';
import HubList from './modules/hubs/HubList';
import ProjectActions from './ProjectActions';

export default () => (
  <Box sx={{ flexShrink: 0 }}>
    <AppBar position="static" color="info">
      <Toolbar
        sx={{
          flexWrap: 'wrap',
          gap: { xs: 0.5, sm: 1 },
          py: { xs: 0.5, sm: 0 },
        }}
      >
        <Typography
          variant="h6"
          component="div"
          sx={{ flex: '1 1 160px', minWidth: 0 }}
        >
          WEB Control Plus
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flex: '1 1 auto',
            minWidth: 0,
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: { xs: 0.5, sm: 1 },
          }}
        >
          <ProjectActions />
          <FullscreenButton />
          <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
            <HubList />
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  </Box>
);
