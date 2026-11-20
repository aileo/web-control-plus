import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import ControlConfigFields from '../../features/controls/ConfigFields';
import ShortcutFields from '../../features/controls/shared/ShortcutFields';
import {
  useControl,
  useDevice,
  usePositionControl,
  useRemoveControl,
  useUpdateControl,
} from '../../core/hooks';
import { supportsServo } from '../../core/controls';
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
  const device = useDevice(control?.uuid, control?.port);
  const position = usePositionControl(id);
  const update = useUpdateControl();
  const remove = useRemoveControl();
  const { close, error, run } = useModalAction(onBusyChange);
  const [draft, setDraft] = useState<Draft>(() => ({
    title: control?.title ?? '',
    options: { ...control?.options },
  }));
  const [confirmed, setConfirmed] = useState(false);
  const [calibrationPending, setCalibrationPending] = useState(false);
  const calibrationRef = useRef(false);
  const stopRef = useRef(position.stop);
  stopRef.current = position.stop;
  useEffect(
    () => () => {
      if (calibrationRef.current) void stopRef.current();
    },
    []
  );
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
  let calibrationLabel = 'Not calibrated';
  if (position.state?.stage === 'ready') calibrationLabel = 'Calibrated';
  if (position.state?.stage === 'left' || position.state?.stage === 'right')
    calibrationLabel = `Seeking ${position.state.stage} stop`;
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
        {(control.type === 'slider' || control.type === 'arrows') &&
          (supportsServo(device) || control.options.mode === 'servo') && (
            <TextField
              select
              label="Mode"
              value={draft.options.mode}
              disabled={busy || calibrationPending}
              slotProps={{ select: { native: true } }}
              onChange={(event) => setOption('mode', event.target.value)}
            >
              <option value="speed">Speed</option>
              <option value="servo">Servo</option>
            </TextField>
          )}
        {(control.type === 'slider' || control.type === 'arrows') &&
          draft.options.mode === 'servo' && (
            <>
              <Typography variant="caption">
                Calibration seeks the left stop, then the right stop. Keep a
                physical stop available.
              </Typography>
              {control.options.mode !== 'servo' ? (
                <Alert severity="info">
                  Save Servo mode before calibrating.
                </Alert>
              ) : (
                <>
                  <FormControlLabel
                    label="I confirm the motor can move safely"
                    control={
                      <Checkbox
                        checked={confirmed}
                        disabled={calibrationPending}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                    }
                  />
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      !confirmed ||
                      !position.available ||
                      calibrationPending
                    }
                    onClick={() => {
                      calibrationRef.current = true;
                      setCalibrationPending(true);
                      void position.calibrate().finally(() => {
                        calibrationRef.current = false;
                        setCalibrationPending(false);
                      });
                    }}
                  >
                    Start calibration
                  </Button>
                  {calibrationPending && (
                    <Button
                      type="button"
                      onClick={() => {
                        void position.stop();
                      }}
                    >
                      Cancel calibration and stop
                    </Button>
                  )}
                  <Typography variant="caption" role="status">
                    {calibrationLabel}
                  </Typography>
                  {position.error && (
                    <Alert severity="error">{String(position.error)}</Alert>
                  )}
                </>
              )}
            </>
          )}
        {((control.type !== 'slider' && control.type !== 'arrows') ||
          draft.options.mode !== 'servo') && (
          <ControlConfigFields
            type={control.type}
            options={draft.options}
            busy={busy}
            setOption={setOption}
          />
        )}
        {draft.options.mode !== 'servo' && (
          <ShortcutFields
            type={control.type}
            options={draft.options}
            busy={busy}
            setOption={setOption}
          />
        )}
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
        <Button
          type="submit"
          variant="contained"
          disabled={busy || calibrationPending}
        >
          Save
        </Button>
      </DialogActions>
    </Box>
  );
}

export default ControlConfig;
