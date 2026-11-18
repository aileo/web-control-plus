import React from 'react';
import { Box, Typography } from '@mui/material';
import { legoColors } from '../../../theme/lego';
import type { ControlOf, DeviceInfo } from '../../../core/types';

function Tilt({
  control,
  device,
}: {
  control: Pick<ControlOf<'tilt'>, 'w' | 'options'>;
  device?: Pick<DeviceInfo, 'events'>;
}) {
  const values = device?.events.tilt || [];
  const { rollAxis, pitchAxis, rollReverseFactor, pitchReverseFactor } =
    control.options;
  const roll = Number.isFinite(values[rollAxis])
    ? values[rollAxis] * rollReverseFactor
    : null;
  const pitch = Number.isFinite(values[pitchAxis])
    ? values[pitchAxis] * pitchReverseFactor
    : null;
  if (roll === null && pitch === null) {
    return (
      <Typography variant="caption" role="status">
        Waiting for tilt
      </Typography>
    );
  }
  const label = (name: string, value: number | null) =>
    `${name}: ${value === null ? 'unavailable' : `${value} degrees`}`;
  const horizon =
    pitch === null ? 50 : Math.max(0, Math.min(100, 50 - (pitch / 180) * 100));
  const edge = `${horizon}%`;
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center',
        gap: 0.25,
      }}
    >
      <Box
        data-tilt-area
        sx={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          display: 'grid',
          placeItems: 'center',
          containerType: 'size',
        }}
      >
        <Box
          role="img"
          aria-label={`${label('Roll', roll)}, ${label('Pitch', pitch)}`}
          sx={{
            width: 'min(100cqw, 100cqh)',
            aspectRatio: '1',
            boxSizing: 'border-box',
            border: '2px solid',
            borderColor: legoColors.dark,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box
            data-tilt-horizon
            sx={{
              position: 'absolute',
              inset: 0,
              transform: roll === null ? undefined : `rotate(${roll}deg)`,
              background: `linear-gradient(${
                legoColors.blue
              } ${edge}, ${legoColors.yellow} ${edge})`,
            }}
          >
            {pitch !== null &&
              [-60, -30, -15, 15, 30, 60].map((angle) => (
                <Box
                  key={angle}
                  data-tilt-pitch-mark={angle}
                  sx={{
                    position: 'absolute',
                    top: `${horizon + (angle / 180) * 100}%`,
                    left: angle % 30 === 0 ? '30%' : '38%',
                    right: angle % 30 === 0 ? '30%' : '38%',
                    height: '1px',
                    bgcolor: legoColors.light,
                    boxShadow: `0 0 1px 1px ${legoColors.dark}`,
                  }}
                />
              ))}
          </Box>
          {Array.from({ length: 12 }, (_, index) => (
            <Box
              key={index}
              aria-hidden="true"
              data-tilt-rim-mark={index * 30}
              sx={{
                position: 'absolute',
                inset: 2,
                transform: `rotate(${index * 30}deg)`,
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 'calc(50% - 1px)',
                  width: 2,
                  height: index % 3 === 0 ? '13%' : '8%',
                  bgcolor: legoColors.dark,
                  boxShadow: `0 0 1px ${legoColors.light}`,
                },
              }}
            />
          ))}
          <Box
            sx={{
              position: 'absolute',
              left: '15%',
              right: '15%',
              top: '50%',
              height: 4,
              bgcolor: legoColors.red,
              border: `1px solid ${legoColors.light}`,
              borderRadius: 1,
            }}
          />
        </Box>
      </Box>
      <Box
        data-tilt-values
        aria-hidden="true"
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 1,
          flexShrink: 0,
        }}
      >
        {(
          [
            ['Roll', roll],
            ['Pitch', pitch],
          ] as const
        ).map(([name, value]) => (
          <Typography
            key={name}
            variant="caption"
            component="span"
            sx={{
              fontSize: control.w === 1 ? 10 : 12,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            {name}: {value === null ? '--' : `${value}\u00b0`}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export default Tilt;
