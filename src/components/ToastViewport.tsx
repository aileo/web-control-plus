import React from 'react';
import { Alert, Box } from '@mui/material';
import { useDismissMessage, useToastMessages } from '../hooks/useToast';

export default function ToastViewport() {
  const messages = useToastMessages();
  const dismiss = useDismissMessage();

  return (
    <Box
      component="section"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions"
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 'min(400px, calc(100vw - 32px))',
        maxHeight: 'calc(100dvh - 32px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        zIndex: (theme) => theme.zIndex.snackbar,
      }}
    >
      {messages.map(({ id, text, level, icon }) => (
        <Alert
          key={id}
          severity={level}
          icon={icon}
          role={level === 'error' || level === 'warning' ? 'alert' : 'status'}
          onClose={() => dismiss(id)}
        >
          {text}
        </Alert>
      ))}
    </Box>
  );
}
