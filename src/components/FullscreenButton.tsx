import React, { useEffect, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import Fullscreen from '@mui/icons-material/Fullscreen';
import FullscreenExit from '@mui/icons-material/FullscreenExit';
import { usePostMessage } from '../core/hooks/useToast';

// Render a control for entering and exiting browser fullscreen mode.
export default function FullscreenButton() {
  const postMessage = usePostMessage();
  const [fullscreen, setFullscreen] = useState(() =>
    Boolean(document.fullscreenElement)
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Keep the button state in sync with browser fullscreen changes.
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (
    !document.fullscreenEnabled ||
    typeof document.documentElement.requestFullscreen !== 'function' ||
    typeof document.exitFullscreen !== 'function'
  ) {
    return null;
  }

  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  // Toggle fullscreen and report browser failures through the toast system.
  const toggle = async () => {
    if (pending) return;
    const exiting = Boolean(document.fullscreenElement);
    setPending(true);
    try {
      if (exiting) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      postMessage({
        level: 'error',
        text: `Could not ${exiting ? 'exit' : 'enter'} fullscreen${
          error instanceof Error && error.message ? `: ${error.message}` : '.'
        }`,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        aria-disabled={pending}
        color="inherit"
        size="small"
        onClick={toggle}
        sx={{
          flexShrink: 0,
          '&.Mui-focusVisible': { outline: '2px solid currentColor' },
        }}
      >
        {fullscreen ? <FullscreenExit /> : <Fullscreen />}
      </IconButton>
    </Tooltip>
  );
}
