import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import ControlConfigFields from '../../features/controls/ConfigFields';
import ShortcutFields from '../../features/controls/shared/ShortcutFields';
import {
  useControl,
  useRemoveControl,
  useUpdateControl,
} from '../../core/hooks';
import type { DialogBusyProps } from '../types';
import useModalAction from '../../core/hooks/useModalAction';

// A draft may contain incomplete input; the action validates it atomically.
type Draft = {
  title: string;
  options: Record<string, string | number | boolean>;
};

// Render and manage settings for an existing control.
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

  // Update one pending option in the control settings form.
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
        <ControlConfigFields
          type={control.type}
          options={draft.options}
          busy={busy}
          setOption={setOption}
        />
        <ShortcutFields
          type={control.type}
          options={draft.options}
          busy={busy}
          setOption={setOption}
        />
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
