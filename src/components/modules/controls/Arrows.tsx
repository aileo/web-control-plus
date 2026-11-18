import React, { useCallback, useEffect, useRef } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowBack from '@mui/icons-material/ArrowBack';
import StopIcon from '@mui/icons-material/Stop';
import { useMotorControl } from '../../../hooks';
import { legoColors } from '../../../theme/lego';
import Error from './Error';
import type { ControlOf } from '../../../core/types';

export function ArrowsFace({
  vertical = false,
  speed = 0,
  runSpeed = 100,
  stopOnRelease = true,
  preview = false,
  available = true,
  getButtonProps,
}: {
  vertical?: boolean;
  speed?: number;
  runSpeed?: number;
  stopOnRelease?: boolean;
  preview?: boolean;
  available?: boolean;
  getButtonProps?: (
    value: number
  ) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const directions = vertical
    ? [
        { label: 'Forward', value: runSpeed, Icon: ArrowUpward },
        { label: 'Stop', value: 0, Icon: StopIcon },
        { label: 'Backward', value: -runSpeed, Icon: ArrowDownward },
      ]
    : [
        { label: 'Backward', value: -runSpeed, Icon: ArrowBack },
        { label: 'Stop', value: 0, Icon: StopIcon },
        { label: 'Forward', value: runSpeed, Icon: ArrowForward },
      ];
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        minHeight: vertical ? 132 : 44,
        minWidth: 44,
        containerType: 'size',
        '--arrow-size': vertical
          ? 'min(100cqw, calc(100cqh / 3))'
          : 'min(calc(100cqw / 3), 100cqh)',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {directions.map(({ label, value, Icon }, index) => {
        let background = 'success.main';
        if (value === 0)
          background = stopOnRelease
            ? 'action.disabledBackground'
            : legoColors.red;
        else if (speed * value > 0) background = 'success.dark';
        const action = stopOnRelease ? 'Hold to go' : 'Go';
        const face = (
          <Box
            component={preview ? 'span' : 'button'}
            type={preview ? undefined : 'button'}
            aria-label={preview ? undefined : label}
            disabled={preview ? undefined : !available}
            {...getButtonProps?.(value)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 'var(--arrow-size)',
              height: 'var(--arrow-size)',
              minWidth: 44,
              minHeight: 44,
              boxSizing: 'border-box',
              p: 0,
              border: `2px solid ${legoColors.dark}`,
              borderLeftWidth: !vertical && index > 0 ? 0 : undefined,
              borderTopWidth: vertical && index > 0 ? 0 : undefined,
              borderRadius: vertical
                ? ['8px 8px 0 0', 0, '0 0 8px 8px'][index]
                : ['8px 0 0 8px', 0, '0 8px 8px 0'][index],
              bgcolor: background,
              color:
                value === 0 && stopOnRelease
                  ? 'text.secondary'
                  : legoColors.light,
              boxShadow:
                speed * value > 0
                  ? `inset 0 0 0 2px ${legoColors.dark}`
                  : undefined,
              touchAction: 'none',
              position: 'relative',
              cursor: preview ? undefined : 'pointer',
              '&:focus-visible': {
                zIndex: 1,
                outline: `3px solid ${legoColors.dark}`,
                outlineOffset: 2,
              },
              ...(!preview && {
                '&:hover': {
                  bgcolor: value === 0 ? background : 'success.dark',
                },
                '&:active': {
                  bgcolor: value === 0 ? background : 'success.dark',
                },
              }),
            }}
          >
            <Icon
              sx={{ fontSize: 'max(28px, calc(var(--arrow-size) * 0.6))' }}
            />
          </Box>
        );
        return preview ? (
          <React.Fragment key={label}>{face}</React.Fragment>
        ) : (
          <Tooltip
            disableInteractive
            key={label}
            title={
              value === 0 ? 'Stop motor' : `${action} ${label.toLowerCase()}`
            }
          >
            {face}
          </Tooltip>
        );
      })}
    </Box>
  );
}

function Arrows({ control }: { control: ControlOf<'arrows'> }) {
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
    source: 'pointer' | 'keyboard';
    pointerId?: number;
    key?: string;
    stopOnRelease: boolean;
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
  const vertical = control.w < control.h;
  const release = useCallback(
    (force = false) => {
      const active = held.current;
      held.current = null;
      if (
        active &&
        (force || active.stopOnRelease) &&
        live.current.available &&
        active.connectionId === live.current.connectionId &&
        active.uuid === live.current.uuid &&
        active.port === live.current.port
      )
        command(0, true);
    },
    [command]
  );
  useEffect(() => {
    const leave = () => release(true);
    window.addEventListener('blur', leave);
    return () => {
      held.current = null;
      window.removeEventListener('blur', leave);
    };
  }, [release, connectionId, available, control.uuid, control.port]);
  const press = (
    event:
      | React.PointerEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
    value: number,
    source: Held['source']
  ) => {
    if (!available || held.current) return;
    if ('pointerId' in event && (event.button !== 0 || !event.isPrimary))
      return;
    if ('key' in event && (![' ', 'Enter'].includes(event.key) || event.repeat))
      return;
    event.preventDefault();
    if ('pointerId' in event) {
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    held.current = {
      ...live.current,
      source,
      pointerId: 'pointerId' in event ? event.pointerId : undefined,
      key: 'key' in event ? event.key : undefined,
      stopOnRelease: control.options.stopOnRelease,
    };
    command(value);
  };
  const releasePointer = (
    event: React.PointerEvent<HTMLButtonElement>,
    force = false
  ) => {
    if (
      held.current?.source === 'pointer' &&
      held.current.pointerId === event.pointerId
    )
      release(force);
  };
  const releaseKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (held.current?.source === 'keyboard' && held.current.key === event.key) {
      event.preventDefault();
      release();
    }
  };
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ArrowsFace
          vertical={vertical}
          speed={speed}
          runSpeed={control.options.speed}
          stopOnRelease={control.options.stopOnRelease}
          available={available}
          getButtonProps={(value) =>
            value === 0
              ? {
                  onClick: () => {
                    held.current = null;
                    command(0);
                  },
                }
              : {
                  onPointerDown: (event) => press(event, value, 'pointer'),
                  onPointerUp: releasePointer,
                  onPointerCancel: (event) => releasePointer(event, true),
                  onLostPointerCapture: (event) => releasePointer(event, true),
                  onKeyDown: (event) => press(event, value, 'keyboard'),
                  onKeyUp: releaseKey,
                  onBlur: () => release(),
                }
          }
        />
      </Box>
      <Typography variant="caption" aria-live="polite" align="center">
        {speed}%
      </Typography>
      <Error error={error} />
    </Box>
  );
}

export default Arrows;
