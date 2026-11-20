import React from 'react';
import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';

import { getDeviceType } from '../../../utils/device-types';
import { useDevice, useOpenModal } from '../../../core/hooks';
import { getControlTypes } from '../../../core/controls';

// Render a device entry with its available control actions.
function Device({
  uuid,
  port,
  onCreate,
}: {
  uuid: string;
  port: string;
  onCreate?: (port: string) => void;
}) {
  const device = useDevice(uuid, port);
  const openModal = useOpenModal();
  if (!device || typeof port !== 'string' || !port.trim()) return null;
  const { connected, type } = device;
  const { label, icon: Icon } = getDeviceType(type.text);
  const name = !connected && type.text === 'UNKNOWN' ? 'Empty port' : label;
  const status = connected ? 'Connected' : 'Disconnected';
  const shortPort = /^[A-Z]$|^\d+$/.test(port) ? `Port ${port}` : 'Built-in';
  const actionable = connected && getControlTypes(device).length > 0;
  const tooltip = `${port} - ${type.text} - ${status}`;
  const content = (
    <>
      <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={name}
        secondary={`${shortPort} - ${status}`}
        sx={{ my: 0, overflowWrap: 'anywhere' }}
        slotProps={{
          primary: { variant: 'body2' },
          secondary: { variant: 'caption' },
        }}
      />
    </>
  );

  return (
    <Tooltip
      disableInteractive
      placement="top"
      slotProps={{
        tooltip: { sx: { maxWidth: 240, overflowWrap: 'anywhere' } },
      }}
      title={actionable ? `${tooltip} - Create control` : tooltip}
      describeChild
    >
      <ListItem
        aria-label={`${port}: ${name}, ${status}`}
        sx={(theme) => ({
          minWidth: 0,
          px: actionable ? 0 : 1,
          py: actionable ? 0 : 0.5,
          alignItems: 'flex-start',
          opacity: connected ? 1 : theme.palette.action.disabledOpacity,
        })}
      >
        {actionable ? (
          <ListItemButton
            component="button"
            type="button"
            aria-label={`Create control for ${port}: ${name}`}
            onClick={() =>
              onCreate
                ? onCreate(port)
                : openModal('createControl', { uuid, port })
            }
            sx={{
              px: 1,
              py: 0.5,
              alignItems: 'flex-start',
              height: '100%',
              width: '100%',
            }}
          >
            {content}
          </ListItemButton>
        ) : (
          content
        )}
      </ListItem>
    </Tooltip>
  );
}

export default Device;
