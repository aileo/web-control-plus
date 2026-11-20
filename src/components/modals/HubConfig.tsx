import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useHub, useRenameHub } from '../../core/hooks';
import type { DialogBusyProps } from '../types';
import useModalAction from '../../core/hooks/useModalAction';

// Render and manage the selected hub's configuration.
function HubConfig({
  uuid,
  busy,
  onBusyChange,
}: DialogBusyProps & {
  uuid: string;
}) {
  const hub = useHub(uuid);
  const rename = useRenameHub();
  const { close, error, run } = useModalAction(onBusyChange);
  const [name, setName] = useState(hub?.name ?? '');
  // Validate and save the hub's edited name.
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    run(() => rename(uuid, name));
  };
  return (
    <Box component="form" onSubmit={save}>
      <DialogTitle id="control-dialog-title">Hub settings</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {!hub?.online && (
          <Alert severity="warning">This hub is disconnected.</Alert>
        )}
        <TextField
          autoFocus
          label="Name"
          value={name}
          required
          disabled={busy || !hub?.online}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 14 } }}
        />
        <Typography variant="caption">Address: {hub?.mac ?? uuid}</Typography>
        <Typography variant="caption">
          Firmware: {hub?.system.firmware ?? 'Unavailable'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !hub?.online}>
          Save
        </Button>
      </DialogActions>
    </Box>
  );
}

export default HubConfig;
