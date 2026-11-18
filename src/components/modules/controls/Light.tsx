import React from 'react';
import {
  Box,
  Switch,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';
import { useSetControlLight } from '../../../hooks';
import type {
  ControlOf,
  DeviceInfo,
  LightControlType,
} from '../../../core/types';
import { ledCapabilities, type LightChanges } from '../../../core/leds';
import colors from '../../../core/lego-colors';
import Brightness from './Brightness';
import CustomColor from './CustomColor';
import ControlError from './Error';

const swatches = Object.entries(colors).filter(([code]) => Number(code) !== 0);
const noInput = () => null;

export function PowerFace({
  on = true,
  disabled = false,
  onChange,
}: {
  on?: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', width: '100%' }}>
      <Switch
        data-power-toggle
        checked={on}
        disabled={disabled}
        onChange={onChange}
        color="success"
        // Decorative previews share the face, but have no native input.
        slots={onChange ? undefined : { input: noInput }}
        slotProps={{ input: { role: 'switch', 'aria-label': 'Light power' } }}
        sx={{
          width: 80,
          maxWidth: '100%',
          height: 44,
          p: 1,
          '& .MuiSwitch-thumb': { width: 28, height: 28 },
          '& .MuiSwitch-track': { borderRadius: 999 },
          '& .MuiSwitch-switchBase': {
            p: 1,
            '&.Mui-checked': { transform: 'translateX(36px)' },
            '&.Mui-focusVisible .MuiSwitch-thumb': {
              outline: '2px solid',
              outlineColor: 'text.primary',
              outlineOffset: 2,
            },
          },
        }}
      />
    </Box>
  );
}

export function PaletteFace({
  selected = '#0068bf',
  rgb = true,
  vertical = false,
  disabled = false,
  onChange,
}: {
  selected?: string | number;
  rgb?: boolean;
  vertical?: boolean;
  disabled?: boolean;
  onChange?: (color: string | number) => void;
}) {
  return (
    <Box
      role={onChange ? 'group' : undefined}
      aria-label={onChange ? 'Light color' : undefined}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${vertical ? 2 : 5}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${vertical ? 5 : 2}, minmax(0, 1fr))`,
        gap: 0.5,
        width: '100%',
        height: '100%',
        minHeight: 0,
        alignItems: 'center',
      }}
    >
      {swatches.map(([code, color]) => {
        const value = rgb ? color.hex : Number(code);
        const sx: SxProps<Theme> = {
          p: 0,
          width: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          height: 'auto',
          aspectRatio: '1 / 1',
          justifySelf: 'center',
          borderRadius: 999,
          bgcolor: color.hex,
          border: '1px solid #00000055',
          boxSizing: 'border-box',
          boxShadow:
            selected === value
              ? 'inset 0 0 0 2px #171717'
              : 'inset 0 1px 0 #ffffff80',
          cursor: onChange ? 'pointer' : undefined,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'info.main',
            outlineOffset: 1,
          },
        };
        return onChange ? (
          <Tooltip disableInteractive title={color.label} key={code}>
            <Box
              component="button"
              type="button"
              aria-label={`Light color: ${color.label}`}
              aria-pressed={selected === value}
              disabled={disabled}
              onClick={() => onChange(value)}
              sx={sx}
            />
          </Tooltip>
        ) : (
          <Box component="span" key={code} sx={sx} />
        );
      })}
    </Box>
  );
}

type LightProps = { control: ControlOf<LightControlType>; device: DeviceInfo };

function LightInputs({
  control,
  device,
  connectionId,
}: LightProps & { connectionId: number }) {
  const send = useSetControlLight();
  const capabilities = ledCapabilities(device.type.num, device.hubType);
  const { light } = device.commands;
  const command = async (changes: LightChanges) => {
    try {
      await send(control.id, changes, {
        uuid: control.uuid,
        port: control.port,
        connectionId,
      });
    } catch {
      // The shared output reports failures to every tile using this light.
    }
  };
  if (!capabilities)
    return <ControlError error="Device does not support lights" />;
  const pending = Boolean(device.lightPending);
  const color = light?.color ?? (capabilities.color === 'rgb' ? '#ffffff' : 10);
  let face;
  if (control.type === 'brightness' && capabilities.step) {
    face = (
      <Brightness
        value={
          device.requestedBrightness ??
          (light?.on === false ? 0 : (light?.brightness ?? 100))
        }
        step={capabilities.step}
        vertical={control.w < control.h}
        onChange={(brightness) => command({ on: brightness > 0, brightness })}
      />
    );
  } else if (control.type === 'power') {
    face = (
      <PowerFace
        on={light?.on === true}
        disabled={pending}
        onChange={() => command({ on: light?.on !== true })}
      />
    );
  } else if (control.type === 'palette' && capabilities.color) {
    face = (
      <PaletteFace
        selected={color}
        rgb={capabilities.color === 'rgb'}
        vertical={control.w < control.h}
        disabled={pending}
        onChange={(next) => command({ on: true, color: next })}
      />
    );
  } else if (control.type === 'customColor' && capabilities.color === 'rgb') {
    face = (
      <CustomColor
        color={String(color)}
        disabled={pending}
        onChange={(next) => command({ on: true, color: next })}
      />
    );
  } else
    return <ControlError error="Device does not support this light control" />;
  let status = 'Not set yet';
  if (light?.on === true) status = 'On';
  if (light?.on === false) status = 'Off';
  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>{face}</Box>
      <Typography
        variant="caption"
        role="status"
        sx={{ fontSize: 10, lineHeight: 1.4, textAlign: 'center' }}
      >
        {pending ? 'Setting light...' : `${status} (app-set)`}
      </Typography>
      <ControlError error={device.lightError} />
    </Box>
  );
}

function Light({ control, device }: LightProps) {
  if (device.connectionId === undefined)
    return <ControlError error="Light connection unavailable" />;
  return (
    <LightInputs
      key={[control.uuid, control.port, device.connectionId, control.type].join(
        ':'
      )}
      control={control}
      device={device}
      connectionId={device.connectionId}
    />
  );
}

export default Light;
