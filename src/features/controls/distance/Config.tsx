import React from 'react';
import { TextField } from '@mui/material';
import type { ControlConfigProps } from '../shared/types';

// Render the distance scale selector.
export default function DistanceConfig({
  options,
  busy,
  setOption,
}: ControlConfigProps) {
  return (
    <TextField
      select
      label="Scale"
      value={options.scale}
      disabled={busy}
      slotProps={{ select: { native: true } }}
      onChange={(event) => setOption('scale', event.target.value)}
    >
      <option value="progressive">Progressive</option>
      <option value="linear">Linear</option>
    </TextField>
  );
}
