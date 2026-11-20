import React, { useCallback, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useMotorControl, usePositionControl } from '../../../core/hooks';
import Error from '../shared/Error';
import useServoRelease from '../shared/useServoRelease';
import type { ControlOf } from '../../../core/types';
import SliderFace, { RangeInput } from '../shared/SliderFace';

const handleHeight = 28;
const speedKeys = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

function SpeedSlider({ control }: { control: ControlOf<'slider'> }) {
  const { speed, command, error, available, connectionId } = useMotorControl(
    control.id
  );
  type Live = {
    available: boolean;
    connectionId: number | undefined;
    uuid: string;
    port: string;
  };
  type Held = Live & {
    source: 'change' | 'pointer' | 'keyboard';
    pointerId?: number;
    key?: string;
    resetOnRelease: boolean;
    command: typeof command;
  };
  const held = useRef<Held | null>(null);
  const live = useRef<Live>({
    available,
    connectionId,
    uuid: control.uuid,
    port: control.port,
  });
  live.current = {
    available,
    connectionId,
    uuid: control.uuid,
    port: control.port,
  };
  // Stop a released slider only on the captured live connection.
  const stop = useCallback(() => {
    const active = held.current;
    held.current = null;
    if (
      active?.resetOnRelease &&
      live.current.available &&
      active.connectionId === live.current.connectionId &&
      active.uuid === live.current.uuid &&
      active.port === live.current.port
    ) {
      active.command(0, true);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('blur', stop);
    window.addEventListener('board-input-release', stop);
    return () => {
      held.current = null;
      window.removeEventListener('blur', stop);
      window.removeEventListener('board-input-release', stop);
    };
  }, [stop, connectionId, available, control.uuid, control.port]);
  // Capture the release policy and connection at the start of this input.
  const begin = (
    source: Held['source'],
    event: { pointerId?: number; key?: string } = {}
  ) => {
    if (
      !available ||
      (held.current &&
        (held.current.source !== 'change' || source === 'change'))
    )
      return;
    held.current = {
      ...live.current,
      source,
      pointerId: event.pointerId,
      key: event.key,
      resetOnRelease: control.options.resetOnRelease,
      command,
    };
  };
  // Stop the motor when the active pointer releases the slider.
  const releasePointer = (event: React.PointerEvent<HTMLInputElement>) => {
    if (
      held.current?.source === 'pointer' &&
      held.current.pointerId === event.pointerId
    )
      stop();
  };
  const vertical = control.w < control.h;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <Box sx={{ flex: 1, minHeight: handleHeight }}>
        <SliderFace
          speed={speed}
          vertical={vertical}
          input={
            <RangeInput
              aria-label="Motor speed"
              vertical={vertical}
              value={speed}
              disabled={!available}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                begin('change');
                (held.current?.command || command)(Number(event.target.value));
              }}
              onPointerDown={(event: React.PointerEvent<HTMLInputElement>) => {
                if (event.button !== 0 || !event.isPrimary) return;
                begin('pointer', event);
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
              onLostPointerCapture={releasePointer}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (speedKeys.includes(event.key)) begin('keyboard', event);
              }}
              onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (
                  held.current?.source === 'keyboard' &&
                  held.current.key === event.key
                )
                  stop();
              }}
              onBlur={stop}
            />
          }
        />
      </Box>
      <Error error={error} />
    </Box>
  );
}

function ServoSlider({ control }: { control: ControlOf<'slider'> }) {
  const { state, reference, available, ready, move, center, error } =
    usePositionControl(control.id, true);
  const autoReturn = control.options.autoReturnToCenter;
  const release = useServoRelease(autoReturn, reference, center);
  const { servoMin, servoMax } = control.options;
  const fraction =
    state?.target != null &&
    typeof servoMin === 'number' &&
    typeof servoMax === 'number'
      ? (state.target - servoMin) / (servoMax - servoMin)
      : 0.5;
  const target = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const vertical = control.w < control.h;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Box sx={{ flex: 1, minHeight: handleHeight }}>
        <SliderFace
          speed={target}
          min={0}
          max={100}
          vertical={vertical}
          input={
            <RangeInput
              aria-label="Servo target position"
              min={0}
              max={100}
              vertical={vertical}
              value={target}
              disabled={!ready && !(autoReturn && reference)}
              aria-valuetext={
                state?.target == null
                  ? 'Not active'
                  : `Requested ${state.target} degrees`
              }
              onChange={(event) => {
                if (ready) void move(Number(event.target.value) / 100);
              }}
              onPointerDown={(event: React.PointerEvent<HTMLInputElement>) => {
                if (
                  ready &&
                  event.button === 0 &&
                  event.isPrimary &&
                  release.begin(event.pointerId)
                )
                  event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerUp={(event: React.PointerEvent<HTMLInputElement>) =>
                release.release(event.pointerId)
              }
              onPointerCancel={(event: React.PointerEvent<HTMLInputElement>) =>
                release.cancel(event.pointerId)
              }
              onLostPointerCapture={(
                event: React.PointerEvent<HTMLInputElement>
              ) => release.cancel(event.pointerId)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (ready && speedKeys.includes(event.key))
                  release.begin(event.key);
              }}
              onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) =>
                release.release(event.key)
              }
              onBlur={release.clear}
            />
          }
        />
      </Box>
      {state?.target != null && (
        <Typography variant="caption">Requested: {state.target}°</Typography>
      )}
      {state &&
        state.target == null &&
        !state.active &&
        available &&
        !error && (
          <Typography variant="caption">
            Select Servo again to reset zero
          </Typography>
        )}
      {!available && (
        <Typography variant="caption">Servo unavailable</Typography>
      )}
      <Error error={error} />
    </Box>
  );
}

export default function Slider({ control }: { control: ControlOf<'slider'> }) {
  return control.options.mode === 'servo' ? (
    <ServoSlider control={control} />
  ) : (
    <SpeedSlider control={control} />
  );
}
