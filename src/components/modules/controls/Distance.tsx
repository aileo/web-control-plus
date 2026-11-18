import React from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { legoColors } from '../../../theme/lego';
import { distanceRanges } from '../../../core/controlTypes';
import type { ControlOf, DeviceInfo } from '../../../core/types';

function Distance({
  device,
  control,
}: {
  control: Pick<ControlOf<'distance'>, 'w'> &
    Partial<Pick<ControlOf<'distance'>, 'options'>>;
  device?: Pick<DeviceInfo, 'events'> & { type?: { num: number } };
}) {
  const distance = device?.events.distance?.[0];
  if (typeof distance !== 'number' || !Number.isFinite(distance)) {
    return (
      <Typography variant="caption" role="status">
        Waiting for distance
      </Typography>
    );
  }
  const maximum = device?.type && distanceRanges[device.type.num];
  if (!maximum) {
    return (
      <Typography variant="caption" role="status">
        Distance range unavailable
      </Typography>
    );
  }
  const normalized = Math.min(maximum, Math.max(0, distance)) / maximum;
  const fraction =
    control?.options?.scale === 'linear' ? normalized : Math.sqrt(normalized);
  const level = Math.min(3, Math.floor(fraction * 4));
  const descriptions = ['Very close', 'Close', 'Far', 'Very far'];
  const arcs = [
    { radius: 14, color: legoColors.red },
    { radius: 27, color: legoColors.yellow },
    { radius: 40, color: legoColors.blue },
    { radius: 53, color: legoColors.blue },
  ];
  return (
    <Box sx={{ width: '100%', alignSelf: 'center', textAlign: 'center' }}>
      <Box
        component="svg"
        viewBox="0 30 128 72"
        role="img"
        aria-label={`Distance indicator: ${descriptions[level]}`}
        sx={{
          display: 'block',
          mx: 'auto',
          width: '100%',
          maxHeight: control?.w === 1 ? 48 : 140,
        }}
      >
        {arcs.map(({ radius, color }, index) => (
          <path
            key={radius}
            d={
              `M ${64 - radius} 92 A ${radius} ${radius} ` +
              `0 0 1 ${64 + radius} 92`
            }
            stroke={level === index ? color : alpha(legoColors.dark, 0.2)}
            strokeWidth="7"
            fill="none"
          />
        ))}
        <circle cx="64" cy="92" r="5" fill={legoColors.dark} />
      </Box>
    </Box>
  );
}

export default Distance;
