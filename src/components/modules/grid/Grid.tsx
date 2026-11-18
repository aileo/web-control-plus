import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import {
  useControls,
  useBoardOccupancy,
  useBoardInstructions,
  useControlsError,
  useClearControlsError,
  useRetryControls,
  useUpdateControl,
  usePostMessage,
} from '../../../hooks';
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  canPlace,
  findSpace,
  snapSize,
} from '../../../core/control-layout';
import GridLayout from './GridLayout';
import GridControls from './GridControls';
import BoardInstructions from './BoardInstructions';
import type { Control, Rect } from '../../../core/types';
import type { LayoutGesture, LayoutPreview, StartGesture } from '../../types';
import errorMessage from '../../../utils/errorMessage';

type Gesture = {
  kind: LayoutGesture;
  control: Control;
  origin: { x: number; y: number };
  pointerId: number;
  element: HTMLElement;
};
const rectangleKeys = ['x', 'y', 'w', 'h'] as const;

function Grid() {
  const controls = useControls();
  const occupancy = useBoardOccupancy();
  const instructions = useBoardInstructions();
  const error = useControlsError();
  const clearError = useClearControlsError();
  const retry = useRetryControls();
  const update = useUpdateControl();
  const postMessage = usePostMessage();
  const board = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const mounted = useRef(false);
  const [preview, setPreview] = useState<LayoutPreview | null>(null);

  const cancel = useCallback((event?: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (event && active && event.pointerId !== active.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (active && active.element.hasPointerCapture?.(active.pointerId)) {
      active.element.releasePointerCapture(active.pointerId);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const leave = () => cancel();
    window.addEventListener('blur', leave);
    return () => {
      mounted.current = false;
      gesture.current = null;
      window.removeEventListener('blur', leave);
    };
  }, [cancel]);
  useEffect(() => {
    if (gesture.current && !controls.has(gesture.current.control.id)) cancel();
  }, [controls, cancel]);

  const point = (event: React.PointerEvent<HTMLElement>) => {
    const rect = board.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / (rect.width / BOARD_COLUMNS),
      y: (event.clientY - rect.top) / (rect.height / BOARD_ROWS),
    };
  };
  const start: StartGesture = (event, control, kind) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      kind,
      control,
      origin: point(event),
      pointerId: event.pointerId,
      element: event.currentTarget,
    };
    setPreview({ id: control.id, rect: control, valid: true });
  };
  const candidate = (
    event: React.PointerEvent<HTMLElement>
  ): LayoutPreview | null => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return null;
    const position = point(event);
    const dx = position.x - active.origin.x;
    const dy = position.y - active.origin.y;
    const { control, kind } = active;
    const rect: Rect =
      kind === 'move'
        ? {
            x: control.x + Math.round(dx),
            y: control.y + Math.round(dy),
            w: control.w,
            h: control.h,
          }
        : {
            x: control.x,
            y: control.y,
            ...snapSize(control.type, control.w + dx, control.h + dy),
          };
    return {
      id: control.id,
      rect,
      valid: canPlace(occupancy, rect, control.id),
    };
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const next = candidate(event);
    if (next) setPreview(next);
  };
  const apply = async (active: Gesture, next: LayoutPreview) => {
    cancel();
    const current = controls.get(active.control.id);
    if (
      !current ||
      rectangleKeys.some((key) => current[key] !== active.control[key])
    ) {
      postMessage({
        level: 'warning',
        text: 'Control changed. Try again.',
      });
      return;
    }
    if (!next.valid) {
      postMessage({
        level: 'warning',
        text: 'That space is outside the board or occupied. Control unchanged.',
      });
      return;
    }
    if (rectangleKeys.every((key) => current[key] === next.rect[key])) return;
    try {
      await update(next.id, next.rect);
      const verb = active.kind === 'move' ? 'moved' : 'resized';
      if (mounted.current)
        postMessage({
          level: 'success',
          text: `${current.title} ${verb}.`,
        });
    } catch (cause) {
      if (mounted.current)
        postMessage({
          level: 'error',
          text: errorMessage(cause),
        });
    }
  };
  const finish = (event: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    const next = candidate(event);
    if (active && next) apply(active, next);
  };
  const full = !findSpace(occupancy, { w: 1, h: 1 });
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        p: { xs: 1, sm: 2 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {full && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Board full.{' '}
          {instructions
            ? 'Dismiss the help tile or remove a control to make space.'
            : 'Remove a control to make space.'}
        </Alert>
      )}
      {Boolean(error) && (
        <Alert
          severity="error"
          onClose={clearError}
          sx={{ mb: 1 }}
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Retry sensors
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      )}
      <GridLayout
        boardRef={board}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
      >
        <BoardInstructions boardRef={board} />
        <GridControls controls={controls} onGesture={start} />
        {preview && (
          <Box
            data-layout-preview={preview.valid ? 'valid' : 'invalid'}
            aria-hidden="true"
            sx={{
              pointerEvents: 'none',
              zIndex: 2,
              position: 'absolute',
              left: `${(preview.rect.x * 100) / BOARD_COLUMNS}%`,
              top: `${(preview.rect.y * 100) / BOARD_ROWS}%`,
              width: `${(preview.rect.w * 100) / BOARD_COLUMNS}%`,
              height: `${(preview.rect.h * 100) / BOARD_ROWS}%`,
              border: '3px dashed',
              borderColor: preview.valid ? 'primary.main' : 'error.main',
              bgcolor: preview.valid ? 'action.selected' : 'action.hover',
            }}
          />
        )}
      </GridLayout>
    </Box>
  );
}

export default Grid;
