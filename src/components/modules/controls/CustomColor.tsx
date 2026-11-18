import React, { useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import tinycolor from 'tinycolor2';
import usePointerDraft from './usePointerDraft';

type ColorPoint = { hue: number; saturation: number };
const rainbow = [
  '#ff0000',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0000ff',
  '#ff00ff',
  '#ff0000',
].join(', ');
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function colorAt({ hue, saturation }: ColorPoint): string {
  return tinycolor({
    h: clamp(hue, 360),
    s: clamp(saturation, 100) / 100,
    l: 0.5,
  }).toHexString();
}

export function pointAt(
  x: number,
  y: number,
  width: number,
  height: number
): ColorPoint {
  return {
    hue: Math.round(clamp(x / width, 1) * 360),
    saturation: Math.round((1 - clamp(y / height, 1)) * 100),
  };
}

export function CustomColorFace({
  point = { hue: 220, saturation: 80 },
}: {
  point?: ColorPoint;
}) {
  return (
    <Box
      data-color-plane
      sx={{
        position: 'absolute',
        inset: 0,
        borderRadius: 1,
        background: [
          'linear-gradient(to bottom, transparent, #808080)',
          `linear-gradient(to right, ${rainbow})`,
        ].join(', '),
        boxShadow: 'inset 0 0 0 1px #00000055',
        pointerEvents: 'none',
      }}
    >
      <Box
        data-color-cursor
        sx={{
          position: 'absolute',
          left: `clamp(7px, ${(point.hue / 360) * 100}%, calc(100% - 7px))`,
          top: `clamp(7px, ${100 - point.saturation}%, calc(100% - 7px))`,
          transform: 'translate(-50%, -50%)',
          width: 10,
          height: 10,
          border: '2px solid white',
          borderRadius: '50%',
          boxShadow: '0 0 0 1px #171717',
          bgcolor: colorAt(point),
        }}
      />
    </Box>
  );
}

function CustomColor({
  color,
  disabled,
  onChange,
}: {
  color: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  const { h, s } = tinycolor(color).toHsl();
  // Gray has no RGB hue; retain the chosen cursor until another color arrives.
  const [cursor, setCursor] = useState<{
    color: string;
    point: ColorPoint;
  } | null>(null);
  const commit = (point: ColorPoint) => {
    const next = colorAt(point);
    setCursor({ color: next, point });
    onChange(next);
  };
  const drag = usePointerDraft(
    cursor?.color === color
      ? cursor.point
      : { hue: h, saturation: Math.round(s * 100) },
    commit
  );
  const hueInput = useRef<HTMLInputElement>(null);
  const fromEvent = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return pointAt(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
  };
  const nativeInput = {
    position: 'absolute',
    width: 1,
    height: 1,
    p: 0,
    m: -1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    border: 0,
  } as const;
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
    >
      <Box
        role="group"
        aria-label="Custom light color"
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 28,
          touchAction: 'none',
          cursor: disabled ? 'default' : 'crosshair',
          opacity: disabled ? 0.5 : 1,
          '&:focus-within [data-color-cursor]': {
            outline: '3px solid',
            outlineColor: 'info.main',
            outlineOffset: 2,
          },
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          hueInput.current?.focus();
          drag.start(event, fromEvent(event));
        }}
        onPointerMove={(event) => drag.move(event, fromEvent(event))}
        onPointerUp={(event) => drag.finish(event, fromEvent(event))}
        onPointerCancel={drag.cancel}
        onLostPointerCapture={drag.cancel}
      >
        <CustomColorFace point={drag.value} />
        <Box
          component="input"
          ref={hueInput}
          type="range"
          min={0}
          max={360}
          step={1}
          aria-label="Light hue"
          aria-valuetext={`${Math.round(drag.value.hue)} degrees`}
          value={drag.value.hue}
          disabled={disabled}
          sx={nativeInput}
          onChange={(event) =>
            commit({ ...drag.value, hue: Number(event.target.value) })
          }
        />
        <Box
          component="input"
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Light saturation"
          aria-valuetext={`${drag.value.saturation}%`}
          value={drag.value.saturation}
          disabled={disabled}
          sx={nativeInput}
          onChange={(event) =>
            commit({ ...drag.value, saturation: Number(event.target.value) })
          }
        />
      </Box>
      <Typography
        variant="caption"
        sx={{ fontSize: 10, textAlign: 'center', lineHeight: 1.4 }}
      >
        {drag.active() ? colorAt(drag.value) : color}
      </Typography>
    </Box>
  );
}

export default CustomColor;
