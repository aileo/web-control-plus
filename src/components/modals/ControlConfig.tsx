import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import Clear from '@mui/icons-material/Clear';
import {
  normalizeShortcutKey,
  shortcutFields,
  shortcutLabel,
} from '../../core/controlTypes';
import { useControl, useRemoveControl, useUpdateControl } from '../../hooks';
import type { DialogBusyProps } from '../types';
import useModalAction from './useModalAction';

// A draft may contain incomplete input; the action validates it atomically.
type Draft = {
  title: string;
  options: Record<string, string | number | boolean>;
};

function ControlConfig({
  id,
  busy,
  onBusyChange,
}: DialogBusyProps & {
  id: string;
}) {
  const control = useControl(id);
  const update = useUpdateControl();
  const remove = useRemoveControl();
  const { close, error, run } = useModalAction(onBusyChange);
  const [draft, setDraft] = useState<Draft>(() => ({
    title: control?.title ?? '',
    options: { ...control?.options },
  }));
  if (!control)
    return (
      <>
        <DialogTitle id="control-dialog-title">Control removed</DialogTitle>
        <DialogContent>
          <Alert severity="info">This control or its hub was removed.</Alert>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={close}>
            Close
          </Button>
        </DialogActions>
      </>
    );

  const setOption = (key: string, value: string | number | boolean) =>
    setDraft((previous) => ({
      ...previous,
      options: { ...previous.options, [key]: value },
    }));
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => update(id, draft));
      }}
    >
      <DialogTitle id="control-dialog-title">Control settings</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Title"
          value={draft.title}
          required
          disabled={busy}
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              title: event.target.value,
            }))
          }
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        {control.type === 'slider' && (
          <>
            <FormControlLabel
              label="Reset to zero on release"
              control={
                <Checkbox
                  checked={draft.options.resetOnRelease === true}
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
                  checked={draft.options.reverseRotation === true}
                  disabled={busy}
                  onChange={(event) =>
                    setOption('reverseRotation', event.target.checked)
                  }
                />
              }
            />
          </>
        )}
        {control.type === 'arrows' && (
          <>
            <TextField
              label="Speed (%)"
              type="number"
              value={draft.options.speed}
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
                  checked={draft.options.stopOnRelease === true}
                  disabled={busy}
                  onChange={(event) =>
                    setOption('stopOnRelease', event.target.checked)
                  }
                />
              }
            />
          </>
        )}
        {['slider', 'arrows'].includes(control.type) && (
          <Typography variant="caption">
            Changes apply to your next input, not the current motor speed.
          </Typography>
        )}
        {control.type === 'distance' && (
          <TextField
            select
            label="Scale"
            value={draft.options.scale}
            disabled={busy}
            slotProps={{ select: { native: true } }}
            onChange={(event) => setOption('scale', event.target.value)}
          >
            <option value="progressive">Progressive</option>
            <option value="linear">Linear</option>
          </TextField>
        )}
        {control.type === 'color' && (
          <TextField
            select
            label="Color stability"
            value={draft.options.stability}
            disabled={busy}
            helperText="Ignore brief color changes; not hardware sensitivity."
            slotProps={{ select: { native: true } }}
            onChange={(event) =>
              setOption('stability', Number(event.target.value))
            }
          >
            <option value={0}>Immediate</option>
            <option value={150}>Stable (150 ms)</option>
            <option value={400}>Very stable (400 ms)</option>
          </TextField>
        )}
        {shortcutFields[control.type].length > 0 && (
          <>
            <Typography variant="subtitle2">Action keys (optional)</Typography>
            <Typography variant="caption">
              Focus a field and press a key. Shared keys operate all matching
              controls, once per press. Keys are inactive while typing or in
              menus/dialogs. Space, Enter, Tab, and Escape are reserved for
              native activation and navigation.
            </Typography>
            {shortcutFields[control.type].map(({ option, label }) => (
              <TextField
                key={option}
                label={`${label} key`}
                value={shortcutLabel(String(draft.options[option] ?? ''))}
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
                        disabled={busy || !draft.options[option]}
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
        )}
        {control.type === 'tilt' &&
          ['roll', 'pitch'].map((axis) => (
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
                value={draft.options[`${axis}Axis`]}
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
                    checked={draft.options[`${axis}ReverseFactor`] === -1}
                    disabled={busy}
                    onChange={(event) =>
                      setOption(
                        `${axis}ReverseFactor`,
                        event.target.checked ? -1 : 1
                      )
                    }
                  />
                }
              />
            </Box>
          ))}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button
          color="error"
          onClick={() => run(() => remove(id))}
          disabled={busy}
          sx={{ mr: 'auto' }}
        >
          Remove control
        </Button>
        <Button color="inherit" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
      </DialogActions>
    </Box>
  );
}

export default ControlConfig;
