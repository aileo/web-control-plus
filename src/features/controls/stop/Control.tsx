import React from 'react';
import { Box } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import { useHub, useMotorControl } from '../../../core/hooks';
import { legoColors } from '../../../theme/lego';
import Error from '../shared/Error';
import type { ControlOf } from '../../../core/types';

const raisedShadow = [
  `0 0 0 2px ${legoColors.dark}`,
  '0 3px 4px 2px rgba(0, 0, 0, 0.35)',
  'inset 0 -4px 0 rgba(0, 0, 0, 0.25)',
  'inset 0 3px 0 rgba(255, 255, 255, 0.25)',
].join(', ');
const pressedShadow = [
  `0 0 0 2px ${legoColors.dark}`,
  '0 1px 2px 2px rgba(0, 0, 0, 0.35)',
  'inset 0 3px 0 rgba(0, 0, 0, 0.25)',
].join(', ');

// Render the stop control's button face.
export function StopFace({
  preview = false,
  available = true,
  label,
  onStop,
}: {
  preview?: boolean;
  available?: boolean;
  label?: string;
  onStop?: () => void;
}) {
  return (
    <Box
      component={preview ? 'span' : 'button'}
      type={preview ? undefined : 'button'}
      aria-label={preview ? undefined : label}
      disabled={preview ? undefined : !available}
      onClick={preview ? undefined : onStop}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxSizing: 'border-box',
        height: 'min(calc(100% - 8px), 96px)',
        minHeight: 48,
        aspectRatio: '1 / 1',
        p: 0,
        m: 0,
        border: '6px solid',
        borderColor: 'primary.main',
        borderRadius: '50%',
        bgcolor: legoColors.red,
        color: legoColors.light,
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 'bold',
        lineHeight: 1,
        textTransform: 'uppercase',
        boxShadow: raisedShadow,
        cursor: preview ? undefined : 'pointer',
        '& svg': { fontSize: 20 },
        '&:focus-visible': {
          outline: `3px solid ${legoColors.blue}`,
          outlineOffset: 3,
        },
        ...(!preview && {
          transition: 'transform 80ms, box-shadow 80ms',
          '&:hover': { filter: 'brightness(1.08)' },
          '&:active': {
            transform: 'translateY(2px)',
            boxShadow: pressedShadow,
          },
          '&:disabled': { opacity: 0.5, cursor: 'not-allowed', filter: 'none' },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }),
      }}
    >
      <StopIcon />
      Stop
    </Box>
  );
}

// Render the stop control and its motor action.
function Stop({ control }: { control: ControlOf<'stop'> }) {
  const { command, error, available } = useMotorControl(control.id);
  const hub = useHub(control.uuid);
  const hubName = hub?.name || control.uuid;
  const label = `Stop motor on ${hubName}, port ${control.port}`;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <StopFace
          available={available}
          label={label}
          onStop={() => command(0)}
        />
      </Box>
      <Error error={error} />
    </Box>
  );
}

export default Stop;
