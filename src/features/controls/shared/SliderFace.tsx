import React from 'react';
import { Box, Typography } from '@mui/material';
import { legoColors } from '../../../theme/lego';

const handleWidth = 48;
const handleHeight = 28;
const handleShadow = `inset 0 0 0 1px ${legoColors.dark}, 0 1px 2px #0000004d`;

// Map a slider value to its normalized visual position.
function positionFor(
  value: number,
  vertical: boolean,
  min: number,
  max: number
) {
  const progress = (value - min) / (max - min);
  const fraction = vertical ? 1 - progress : progress;
  const inset = (vertical ? handleHeight : handleWidth) / 2;
  return `calc(${fraction * 100}% + ${inset * (1 - 2 * fraction)}px)`;
}

// Render the accessible range input used by motor slider controls.
export function RangeInput({
  value,
  vertical = false,
  min = -100,
  max = 100,
  step = 1,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> & {
  value: number;
  vertical?: boolean;
}) {
  return (
    <Box
      component="input"
      type="range"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuetext={`${value}%`}
      min={min}
      max={max}
      step={step}
      value={value}
      {...props}
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        appearance: 'none',
        p: 0,
        m: 0,
        opacity: 0,
        zIndex: 1,
        cursor: 'pointer',
        writingMode: vertical ? 'vertical-lr' : undefined,
        direction: vertical ? 'rtl' : 'ltr',
        touchAction: 'none',
        '&::-webkit-slider-thumb': {
          appearance: 'none',
          width: handleWidth,
          height: handleHeight,
        },
        '&::-moz-range-thumb': {
          border: 0,
          width: handleWidth,
          height: handleHeight,
        },
        '&:focus-visible + .slider-art': {
          outline: `2px solid ${legoColors.dark}`,
          outlineOffset: '-2px',
        },
      }}
    />
  );
}

// Render the visual track, marks, and handle for a motor slider.
export default function SliderFace({
  speed = 0,
  vertical = false,
  input = null,
  min = -100,
  max = 100,
}: {
  speed?: number;
  vertical?: boolean;
  input?: React.ReactNode;
  min?: number;
  max?: number;
}) {
  const position = positionFor(speed, vertical, min, max);
  const marks = Array.from(
    { length: (max - min) / 10 + 1 },
    (_, index) => min + index * 10
  );
  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        minHeight: handleHeight,
        minWidth: handleWidth,
      }}
    >
      {input}
      <Box
        className="slider-art"
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            bgcolor: legoColors.blue,
            boxShadow: `inset 0 0 0 2px ${legoColors.dark}`,
            borderRadius: 2,
            ...(vertical
              ? {
                  top: handleHeight / 2,
                  bottom: handleHeight / 2,
                  left: 'calc(50% - 4px)',
                  width: 8,
                }
              : {
                  left: handleWidth / 2,
                  right: handleWidth / 2,
                  top: 'calc(50% - 4px)',
                  height: 8,
                }),
          }}
        />
        {marks.map((mark) => (
          <Box
            key={mark}
            data-slider-mark={mark}
            sx={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              bgcolor: legoColors.dark,
              ...(vertical
                ? {
                    left: '50%',
                    top: positionFor(mark, vertical, min, max),
                    width: mark === 0 ? 32 : 24,
                    height: mark === 0 ? 3 : '1px',
                  }
                : {
                    top: '50%',
                    left: positionFor(mark, vertical, min, max),
                    width: mark === 0 ? 3 : '1px',
                    height: mark === 0 ? 32 : 24,
                  }),
            }}
          />
        ))}
      </Box>
      <Box
        data-slider-handle
        sx={{
          position: 'absolute',
          boxSizing: 'border-box',
          transform: 'translate(-50%, -50%)',
          width: handleWidth,
          height: handleHeight,
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          boxShadow: handleShadow,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 2,
          ...(vertical
            ? { left: '50%', top: position }
            : { top: '50%', left: position }),
        }}
      >
        <Typography
          variant="caption"
          component="span"
          aria-live="polite"
          sx={{ fontWeight: 'bold', fontSize: 11, lineHeight: '16px' }}
        >
          {speed}%
        </Typography>
      </Box>
    </Box>
  );
}
