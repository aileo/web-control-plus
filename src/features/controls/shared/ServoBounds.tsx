import React from 'react';
import {
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';

export default function ServoBounds({
  min,
  max,
  autoReturnToCenter,
  busy,
  setOption,
}: {
  min: unknown;
  max: unknown;
  autoReturnToCenter: boolean;
  busy: boolean;
  setOption: (
    key: 'servoMin' | 'servoMax' | 'autoReturnToCenter',
    value: number | '' | boolean
  ) => void;
}) {
  return (
    <>
      <Typography variant="caption">
        Enter safe bounds in degrees relative to virtual zero. These limits
        constrain requests, not measured motion.
      </Typography>
      {(
        [
          ['servoMin', 'Minimum angle (degrees)', min],
          ['servoMax', 'Maximum angle (degrees)', max],
        ] as const
      ).map(([key, label, value]) => (
        <TextField
          key={key}
          label={label}
          type="number"
          value={typeof value === 'number' ? value : ''}
          required
          disabled={busy}
          slotProps={{ htmlInput: { step: 1 } }}
          onChange={(event) =>
            setOption(
              key,
              event.target.value === '' ? '' : Number(event.target.value)
            )
          }
        />
      ))}
      <FormControlLabel
        label="Auto return to center"
        control={
          <Checkbox
            checked={autoReturnToCenter}
            disabled={busy}
            onChange={(event) =>
              setOption('autoReturnToCenter', event.target.checked)
            }
          />
        }
      />
    </>
  );
}
