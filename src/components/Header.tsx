import React from 'react';
import { AppBar, Box, Toolbar, Typography } from '@mui/material';
import HubList from './modules/hubs/HubList';

export default () => (
  <Box sx={{ flexShrink: 0 }}>
    <AppBar position="static" color="info">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          WEB Control Plus
        </Typography>
        <HubList />
      </Toolbar>
    </AppBar>
  </Box>
);
