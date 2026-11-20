import React from 'react';
import { Checkbox, FormControlLabel, Typography } from '@mui/material';
import type { ControlConfigProps } from '../shared/types';

// Render the slider-specific settings fields.
export default function SliderConfig({
  options,
  busy,
  setOption,
}: ControlConfigProps) {
  return (
    <>
      <FormControlLabel
        label="Reset to zero on release"
        control={
          <Checkbox
            checked={options.resetOnRelease === true}
            disabled={busy}
            onChange={(event) =>
              setOption('resetOnRelease', event.target.checked)
            }
          />
        }
      />
      <FormControlLabel
        label="Reverse rotation"
        control={
          <Checkbox
            checked={options.reverseRotation === true}
            disabled={busy}
            onChange={(event) =>
              setOption('reverseRotation', event.target.checked)
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
