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
import ControlConfigFields from '../../features/controls/ConfigFields';
import ShortcutFields from '../../features/controls/shared/ShortcutFields';
import ServoBounds from '../../features/controls/shared/ServoBounds';
import {
  useControl,
  useDevice,
  usePositionControl,
  useRemoveControl,
  useUpdateControl,
} from '../../core/hooks';
import {
  motorPositionCapabilities,
  stepAngleRange,
  supportsServo,
  supportsStep,
} from '../../core/controls';
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
  const stepRange = stepAngleRange(device);
  const position = usePositionControl(id);
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
  const servoAvailable = supportsServo(device);
  const stepAvailable = control.type === 'arrows' && supportsStep(device);
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
          (servoAvailable ||
            stepAvailable ||
            control.options.mode !== 'speed') && (
            <TextField
              select
              label="Mode"
              value={draft.options.mode}
              disabled={busy}
              slotProps={{ select: { native: true } }}
              onChange={(event) => setOption('mode', event.target.value)}
            >
              <option value="speed">Speed</option>
              {(servoAvailable || control.options.mode === 'servo') && (
                <option value="servo">Servo</option>
              )}
              {control.type === 'arrows' &&
                (stepAvailable || control.options.mode === 'step') && (
                  <option value="step">Step</option>
                )}
            </TextField>
          )}
        {control.type === 'arrows' && draft.options.mode === 'step' && (
          <TextField
            label="Step angle (degrees)"
            type="number"
            value={draft.options.angle}
            required
            disabled={busy}
            onChange={(event) =>
              setOption(
                'angle',
                event.target.value === '' ? '' : Number(event.target.value)
              )
            }
            slotProps={{
              htmlInput: {
                min: stepRange?.minDegrees,
                max: stepRange?.maxDegrees,
                step: 'any',
              },
            }}
          />
        )}
        {(control.type === 'slider' || control.type === 'arrows') &&
          draft.options.mode === 'servo' && (
            <ServoBounds
              min={draft.options.servoMin}
              max={draft.options.servoMax}
              autoReturnToCenter={draft.options.autoReturnToCenter === true}
              busy={busy}
              setOption={setOption}
            />
          )}
        {control.type === 'arrows' &&
          (draft.options.mode === 'servo' || draft.options.mode === 'step') && (
            <>
              {device?.positionDriver &&
              motorPositionCapabilities(device).finiteAngle &&
              draft.options.mode === 'step' ? (
                <Typography variant="caption">
                  Verified absolute angle range:{' '}
                  {device.positionDriver.absoluteAngle.min} to{' '}
                  {device.positionDriver.absoluteAngle.max} degrees.
                </Typography>
              ) : (
                draft.options.mode === 'step' &&
                !stepAvailable && (
                  <Alert severity="info">
                    Step positioning is unavailable on this device.
                  </Alert>
                )
              )}
              {position.error && (
                <Alert severity="error">{String(position.error)}</Alert>
              )}
            </>
          )}
        {((control.type !== 'slider' && control.type !== 'arrows') ||
          draft.options.mode === 'speed') && (
          <ControlConfigFields
            type={control.type}
            options={draft.options}
            busy={busy}
            setOption={setOption}
          />
        )}
        {(draft.options.mode === undefined ||
          draft.options.mode === 'speed') && (
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
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
      </DialogActions>
    </Box>
  );
}

export default ControlConfig;
