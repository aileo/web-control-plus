import React from 'react';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import AddLink from '@mui/icons-material/AddLink';
import errorMessage from '../../../utils/errorMessage';
import {
  useAddHub,
  useConnectingHub,
  usePostMessage,
  useSetHubMenu,
} from '../../../hooks';

function ConnectHub() {
  const add = useAddHub();
  const connecting = useConnectingHub();
  const postMessage = usePostMessage();
  const setHubMenu = useSetHubMenu();
  const connect = async () => {
    try {
      const hub = await add();
      postMessage({
        text: `${hub.name || hub.uuid} connected`,
        level: 'success',
      });
      setHubMenu(hub.uuid);
    } catch (cause) {
      postMessage({
        text: errorMessage(cause),
        level: 'error',
        duration: 6000,
      });
    }
  };
  const icon = connecting ? (
    <CircularProgress size={24} color="inherit" />
  ) : (
    <AddLink />
  );
  return (
    <Tooltip
      disableInteractive
      title={connecting ? 'Connecting hub...' : 'Connect hub'}
    >
      <span>
        <IconButton
          aria-label={connecting ? 'Connecting hub...' : 'Connect hub'}
          aria-busy={connecting}
          disabled={connecting}
          onClick={connect}
          sx={(theme) => ({
            width: 44,
            height: 44,
            borderRadius: 2,
            border: `2px solid ${theme.palette.divider}`,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            boxShadow: theme.shadows[1],
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-focusVisible': {
              outline: `3px solid ${theme.palette.text.primary}`,
              outlineOffset: 2,
            },
            '&.Mui-disabled': {
              bgcolor: 'action.disabledBackground',
              color: 'text.secondary',
            },
          })}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default ConnectHub;
