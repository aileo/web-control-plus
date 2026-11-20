import React from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

const colors = ['primary', 'info', 'success', 'error'] as const;

// Render one illustrated step in the board instructions.
function InstructionStep({
  number,
  top = false,
  children,
}: React.PropsWithChildren<{
  number: number;
  top?: boolean;
}>) {
  const color = colors[(number - 1) % colors.length];
  return (
    <Box
      component="li"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr)',
        alignItems: top ? 'start' : 'center',
        gap: 1.5,
        pr: 1,
        borderRadius: 2,
        bgcolor: alpha(theme.palette[color].main, 0.09),
      })}
    >
      <Box
        component="span"
        aria-hidden="true"
        data-step-number={number}
        sx={{
          width: 48,
          height: 48,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          fontSize: 32,
          lineHeight: 1,
          fontWeight: 800,
          boxShadow: 'inset 0 2px 0 #ffffff80, 0 2px 3px #00000026',
          bgcolor: `${color}.main`,
          color: `${color}.contrastText`,
        }}
      >
        {number}
      </Box>
      {children}
    </Box>
  );
}

export default InstructionStep;
