import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Divider,
  IconButton,
  List,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material';
import Build from '@mui/icons-material/Build';
import LinkOff from '@mui/icons-material/LinkOff';
import PowerSettingsNew from '@mui/icons-material/PowerSettingsNew';
import DeleteForever from '@mui/icons-material/DeleteForever';

import {
  useHub,
  useDisconnectHub,
  useShutdownHub,
  useRemoveHub,
  useOpenModal,
  useHubDevices,
  useDevicesError,
  useHubMenu,
  useSetHubMenu,
  useModal,
  useHubShortcut,
} from '../../../core/hooks';
import Device from '../device/Device';
import HubButton from './HubButton';
import errorMessage from '../../../utils/error-message';

// Render one hub's status, devices, and available hub actions.
function Hub({ uuid }: { uuid: string }) {
  const hub = useHub(uuid);
  const disconnect = useDisconnectHub();
  const shutdown = useShutdownHub();
  const remove = useRemoveHub();
  const openModal = useOpenModal();
  const devices = useHubDevices(uuid);
  const devicesError = useDevicesError();
  const hubMenu = useHubMenu();
  const setHubMenu = useSetHubMenu();
  const modal = useModal();
  const shortcut = useHubShortcut();
  const modalOpen = modal.name !== null;
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const open = hubMenu === uuid && !modalOpen && Boolean(anchor);

  useEffect(() => {
    if (hubMenu === uuid && !modalOpen) {
      setHandoff(false);
      setAnchor(trigger.current);
    }
  }, [hubMenu, modalOpen, uuid]);

  // Open the hub action menu and retain its trigger for focus management.
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setHandoff(false);
    setAnchor(event.currentTarget);
    setHubMenu(uuid);
  };
  // Close the menu unless the click belongs to its keyboard shortcut target.
  const closeMenu = (event?: object, reason?: string) => {
    const target = shortcut.current;
    if (
      reason === 'backdropClick' &&
      event &&
      'clientX' in event &&
      typeof event.clientX === 'number' &&
      'clientY' in event &&
      typeof event.clientY === 'number' &&
      target?.uuid === uuid &&
      target.element.isConnected
    ) {
      const rect = target.element.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom
      )
        return;
    }
    setHubMenu(null);
  };
  // Open control creation for the selected device port.
  const createControl = (port: string) => {
    setHandoff(true);
    closeMenu();
    openModal('createControl', { uuid, port, returnFocusId: `${id}-button` });
  };
  // Open settings for this hub.
  const configure = () => {
    closeMenu();
    openModal('hubConfig', { uuid });
  };

  // Run a hub action and display any resulting error.
  const runAction = async (action: (uuid: string) => Promise<unknown>) => {
    closeMenu();
    setPending(true);
    setError(null);
    try {
      await action(uuid);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  if (!hub) return null;
  const { name, system, online } = hub;
  const label = name || uuid;
  const ports = [...devices.keys()].filter(
    (port) => typeof port === 'string' && port.trim()
  );
  const hubActions = [
    {
      name: 'Configure hub',
      icon: Build,
      run: configure,
      disabled: !online,
      color: 'primary',
    },
    {
      name: 'Disconnect hub',
      icon: LinkOff,
      run: () => runAction(disconnect),
      disabled: !online,
      color: 'warning',
    },
    {
      name: 'Shutdown hub',
      icon: PowerSettingsNew,
      run: () => runAction(shutdown),
      disabled: !online,
      color: 'error',
    },
    {
      name: 'Remove hub',
      icon: DeleteForever,
      run: () => runAction(remove),
      disabled: online,
      color: 'error',
    },
  ] satisfies {
    name: string;
    icon: typeof Build;
    run: () => void;
    disabled: boolean;
    color: 'primary' | 'warning' | 'error';
  }[];

  return (
    <Box sx={{ flexShrink: 0 }}>
      <Tooltip
        disableInteractive
        title={open ? '' : `${label} - ${online ? 'Online' : 'Offline'}`}
      >
        <span>
          <HubButton
            hub={hub}
            ref={trigger}
            color="inherit"
            id={`${id}-button`}
            aria-label={`${label} actions`}
            aria-haspopup="dialog"
            aria-controls={open ? `${id}-panel` : undefined}
            aria-expanded={open ? 'true' : undefined}
            disabled={pending}
            onClick={openMenu}
          />
        </span>
      </Tooltip>
      <Popover
        disableRestoreFocus={handoff}
        id={`${id}-panel`}
        anchorEl={anchor}
        open={open}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': `${id}-title`,
            sx: {
              width: { xs: 280, sm: 400 },
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100dvh - 32px)',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
          }}
        >
          <Tooltip
            disableInteractive
            placement="top"
            title={label}
            describeChild
            slotProps={{
              tooltip: { sx: { maxWidth: 240, overflowWrap: 'anywhere' } },
            }}
          >
            <Typography
              variant="subtitle2"
              id={`${id}-title`}
              noWrap
              sx={{ flex: 1, minWidth: 0 }}
            >
              {label}
            </Typography>
          </Tooltip>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            {online ? 'Online' : 'Offline'}
            {system?.batteryLevel != null &&
              ` - Battery ${system.batteryLevel}%`}
          </Typography>
        </Box>
        <Divider />
        <Box
          role="group"
          aria-label="Hub actions"
          sx={{
            display: 'flex',
            justifyContent: 'space-around',
            px: 1,
            py: 0.5,
          }}
        >
          {hubActions.map(
            (
              {
                name: actionName,
                icon: Icon,
                run,
                disabled,
                color: actionColor,
              },
              i
            ) => (
              <Tooltip
                disableInteractive
                key={actionName}
                title={actionName}
                describeChild
              >
                <span style={{ display: 'inline-flex' }}>
                  <IconButton
                    aria-label={actionName}
                    onClick={run}
                    disabled={disabled}
                    autoFocus={i === (online ? 0 : 3)}
                    sx={(theme) => ({
                      width: 44,
                      height: 44,
                      bgcolor: theme.palette[actionColor].main,
                      color: theme.palette[actionColor].contrastText,
                      '&:hover': {
                        bgcolor: theme.palette[actionColor].dark,
                      },
                      '&.Mui-focusVisible': {
                        outline: `2px solid ${theme.palette.text.primary}`,
                        outlineOffset: 2,
                      },
                      '&.Mui-disabled': {
                        bgcolor: theme.palette.action.disabledBackground,
                        color: theme.palette.action.disabled,
                        opacity: theme.palette.action.disabledOpacity,
                      },
                    })}
                  >
                    <Icon />
                  </IconButton>
                </span>
              </Tooltip>
            )
          )}
        </Box>
        <Divider />
        <Box sx={{ pb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ px: 2, pt: 0.5 }}
            id={`${id}-devices`}
          >
            Devices
          </Typography>
          <List
            dense
            aria-labelledby={`${id}-devices`}
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
              },
              gap: 0.5,
              px: 1,
              py: 0.5,
            }}
          >
            {ports.map((port) => (
              <Device
                key={port}
                uuid={uuid}
                port={port}
                onCreate={createControl}
              />
            ))}
          </List>
          {!ports.length && (
            <Typography sx={{ px: 2, pb: 1 }} color="text.secondary">
              No devices available
            </Typography>
          )}
          {Boolean(devicesError) && (
            <Alert severity="error">{errorMessage(devicesError)}</Alert>
          )}
        </Box>
      </Popover>
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  );
}

export default Hub;
