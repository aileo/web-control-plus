import React from 'react';
import { TextField } from '@mui/material';
import type { ControlConfigProps } from '../shared/types';

// Render the color stability selector.
export default function ColorConfig({
  options,
  busy,
  setOption,
}: ControlConfigProps) {
  return (
    <TextField
      select
      label="Color stability"
      value={options.stability}
      disabled={busy}
      helperText="Ignore brief color changes; not hardware sensitivity."
      slotProps={{ select: { native: true } }}
      onChange={(event) => setOption('stability', Number(event.target.value))}
    >
      <option value={0}>Immediate</option>
      <option value={150}>Stable (150 ms)</option>
      <option value={400}>Very stable (400 ms)</option>
    </TextField>
  );
}
