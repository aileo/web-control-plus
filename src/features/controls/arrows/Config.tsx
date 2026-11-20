import React from 'react';
import {
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import type { ControlConfigProps } from '../shared/types';

// Render the arrows-specific speed and release settings.
export default function ArrowsConfig({
  options,
  busy,
  setOption,
}: ControlConfigProps) {
  return (
    <>
      <TextField
        label="Speed (%)"
        type="number"
        value={options.speed}
        required
        disabled={busy}
        onChange={(event) =>
          setOption(
            'speed',
            event.target.value === '' ? '' : Number(event.target.value)
          )
        }
        slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
      />
      <FormControlLabel
        label="Stop on release"
        control={
          <Checkbox
            checked={options.stopOnRelease === true}
            disabled={busy}
            onChange={(event) =>
              setOption('stopOnRelease', event.target.checked)
            }
          />
        }
      />
      <Typography variant="caption">
        Changes apply to your next input, not the current motor speed.
      </Typography>
    </>
  );
}
