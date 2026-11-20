import React, { useCallback, useEffect, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useMotorControl, usePositionControl } from '../../../core/hooks';
import Error from '../shared/Error';
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
  const { state, available, ready, move, stop, error } = usePositionControl(
    control.id
  );
  const target = Math.round((state?.fraction ?? 0.5) * 100);
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
              disabled={!ready}
              onChange={(event) => {
                void move(Number(event.target.value) / 100);
              }}
            />
          }
        />
      </Box>
      {!ready && (
        <Typography variant="caption">Calibrate in settings</Typography>
      )}
      <Button
        size="small"
        disabled={!available}
        onClick={() => {
          void stop();
        }}
      >
        Stop
      </Button>
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
