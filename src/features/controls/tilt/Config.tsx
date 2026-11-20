import React from 'react';
import { Box, Checkbox, FormControlLabel, TextField } from '@mui/material';
import type { ControlConfigProps } from '../shared/types';

// Render the roll and pitch axis settings.
export default function TiltConfig({
  options,
  busy,
  setOption,
}: ControlConfigProps) {
  return ['roll', 'pitch'].map((axis) => (
    <Box
      key={axis}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 0.5, sm: 2 },
      }}
    >
      <TextField
        select
        label={`${axis === 'roll' ? 'Roll' : 'Pitch'} axis`}
        value={options[`${axis}Axis`]}
        disabled={busy}
        slotProps={{ select: { native: true } }}
        onChange={(event) =>
          setOption(`${axis}Axis`, Number(event.target.value))
        }
        sx={{ flex: 1 }}
      >
        {['X', 'Y', 'Z'].map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </TextField>
      <FormControlLabel
        label={`Reverse ${axis}`}
        control={
          <Checkbox
            checked={options[`${axis}ReverseFactor`] === -1}
            disabled={busy}
            onChange={(event) =>
              setOption(`${axis}ReverseFactor`, event.target.checked ? -1 : 1)
            }
          />
        }
      />
    </Box>
  ));
}
