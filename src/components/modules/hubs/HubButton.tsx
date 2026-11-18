import React from 'react';
import { Box, Button, Typography, type ButtonProps } from '@mui/material';
import BatteryStd from '@mui/icons-material/BatteryStd';
import tinycolor from 'tinycolor2';
import type { HubInfo } from '../../../core/types';

function HubButton({ hub, ...props }: ButtonProps & { hub: HubInfo }) {
  const { type, color, online, system } = hub;
  return (
    <Button
      {...props}
      color="inherit"
      sx={{
        minWidth: 48,
        flexShrink: 0,
        px: 1,
        py: 0.5,
        flexDirection: 'column',
        borderRadius: 0,
        borderBottom: '3px solid',
        borderBottomColor: tinycolor(color)
          .saturate(30)
          .darken(12)
          .toHexString(),
        opacity: online ? 1 : 0.5,
      }}
    >
      <Typography component="span" variant="button" sx={{ fontWeight: 'bold' }}>
        {type.compact}
      </Typography>
      <Box
        component="span"
        aria-label={
          system?.batteryLevel != null
            ? `Battery ${system.batteryLevel}%`
            : 'Battery level unavailable'
        }
        sx={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.625rem',
          lineHeight: 1,
          fontWeight: 'normal',
          opacity: 0.85,
        }}
      >
        <BatteryStd sx={{ fontSize: 12 }} />
        {system?.batteryLevel != null ? `${system.batteryLevel}%` : '--'}
      </Box>
    </Button>
  );
}

export default HubButton;
