import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { CONSTS } from '../../../core/clients/lego';
import { legoColors } from '../../../theme/lego';
import colors from '../../../core/lego-colors';
import type { ControlOf, DeviceInfo } from '../../../core/types';

const { Color: ColorCode } = CONSTS;

type ColorProps = {
  control: Pick<ControlOf<'color'>, 'w'> &
    Partial<Pick<ControlOf<'color'>, 'uuid' | 'port' | 'options'>>;
  device?: Pick<DeviceInfo, 'events'> &
    Partial<Pick<DeviceInfo, 'connectionId'>>;
};

// Render the latest sensor color and its parsed label.
function ColorReading({
  candidate,
  delay,
  control,
}: {
  candidate?: number;
  delay: number;
  control: ColorProps['control'];
}) {
  const [stable, setStable] = useState<number>();
  useEffect(() => {
    if (!delay) return undefined;
    const timer = setTimeout(() => setStable(candidate), delay);
    return () => clearTimeout(timer);
  }, [candidate, delay]);
  const reading = delay ? stable : candidate;
  const color =
    typeof reading === 'number' && Number.isInteger(reading)
      ? colors[reading]
      : null;
  let label = color?.label || 'Unknown color';
  if (reading === undefined) label = 'Waiting for color';
  else if (reading === ColorCode.NONE) label = 'No color detected';
  return (
    <Box
      role="img"
      aria-label={color ? `Detected color: ${label}` : label}
      aria-live="polite"
      sx={{ alignSelf: 'center', width: '100%', textAlign: 'center' }}
    >
      <Box
        aria-hidden="true"
        sx={{
          mx: 'auto',
          width: control.w === 1 ? 40 : 132,
          maxWidth: '80%',
          aspectRatio: '1',
          borderRadius: 1,
          border: `2px solid ${legoColors.dark}`,
          bgcolor: color?.hex || legoColors.light,
          backgroundImage: color
            ? undefined
            : 'repeating-linear-gradient(135deg, transparent 0 5px, ' +
              '#d0d3d6 5px 7px)',
          boxShadow: 'inset 0 0 0 2px #ffffff88',
        }}
      />
      <Typography
        component="p"
        variant="caption"
        sx={{ mt: 0.25, lineHeight: 1.2 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// Render a color sensor control with its recent readings.
function Color({ device, control }: ColorProps) {
  const delay = control.options?.stability ?? 0;
  return (
    <ColorReading
      key={JSON.stringify([
        control.uuid,
        control.port,
        device?.connectionId,
        delay,
      ])}
      candidate={device?.events.color?.[0]}
      delay={delay}
      control={control}
    />
  );
}

export default Color;
