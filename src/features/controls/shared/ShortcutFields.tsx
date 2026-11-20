import React from 'react';
import { IconButton, TextField, Typography } from '@mui/material';
import Clear from '@mui/icons-material/Clear';
import type { ControlType } from '../types';
import { controlTypes } from '../definitions';
import { normalizeShortcutKey, shortcutLabel } from './shortcuts';

// Render editable keyboard bindings declared by a control type.
export default function ShortcutFields({
  type,
  options,
  busy,
  setOption,
}: {
  type: ControlType;
  options: Record<string, string | number | boolean>;
  busy: boolean;
  setOption: (key: string, value: string | number | boolean) => void;
}) {
  const fields = controlTypes[type].shortcutFields;
  if (!fields.length) return null;
  return (
    <>
      <Typography variant="subtitle2">Action keys (optional)</Typography>
      <Typography variant="caption">
        Focus a field and press a key. Shared keys operate all matching
        controls, once per press. Keys are inactive while typing or in
        menus/dialogs. Space, Enter, Tab, and Escape are reserved for native
        activation and navigation.
      </Typography>
      {fields.map(({ option, label }) => (
        <TextField
          key={option}
          label={`${label} key`}
          value={shortcutLabel(String(options[option] ?? ''))}
          placeholder="Not assigned"
          disabled={busy}
          onKeyDown={(event) => {
            if (
              !(event.target instanceof HTMLInputElement) ||
              [' ', 'Enter', 'Tab', 'Escape'].includes(event.key)
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            if (
              event.repeat ||
              event.nativeEvent.isComposing ||
              event.ctrlKey ||
              event.altKey ||
              event.metaKey
            )
              return;
            const key = normalizeShortcutKey(event.key);
            if (key) setOption(option, key);
          }}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <IconButton
                  type="button"
                  aria-label={`Clear ${label.toLowerCase()} key`}
                  disabled={busy || !options[option]}
                  onClick={() => setOption(option, '')}
                >
                  <Clear fontSize="small" />
                </IconButton>
              ),
            },
          }}
        />
      ))}
    </>
  );
}
