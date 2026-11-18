import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import DragIndicator from '@mui/icons-material/DragIndicator';
import OpenInFull from '@mui/icons-material/OpenInFull';
import Settings from '@mui/icons-material/Settings';
import {
  useControlStatus,
  useHub,
  useOpenModal,
  useRetryControls,
} from '../../../hooks';
import { getDeviceType } from '../../../utils/deviceTypes';
import { controlTypes } from '../../../core/controlTypes';
import { tileSx } from '../../../theme/lego';
import ControlError from './Error';
import Tilt from './Tilt';
import Distance from './Distance';
import Color from './Color';
import Slider from './Slider';
import Arrows from './Arrows';
import Stop from './Stop';
import Light from './Light';
import type { Control as ControlRecord, DeviceInfo } from '../../../core/types';
import type { StartGesture } from '../../types';

function renderWidget(control: ControlRecord, device: DeviceInfo) {
  switch (control.type) {
    case 'tilt':
      return <Tilt control={control} device={device} />;
    case 'distance':
      return <Distance control={control} device={device} />;
    case 'color':
      return <Color control={control} device={device} />;
    case 'slider':
      return <Slider control={control} />;
    case 'arrows':
      return <Arrows control={control} />;
    case 'stop':
      return <Stop control={control} />;
    case 'brightness':
    case 'power':
    case 'palette':
    case 'customColor':
      return <Light control={control} device={device} />;
    default: {
      const unreachable: never = control;
      throw new Error(`Unknown control: ${String(unreachable)}`);
    }
  }
}

function Control({
  control,
  onGesture,
}: {
  control: ControlRecord;
  onGesture?: StartGesture;
}) {
  const { device, available, reason, subscription } = useControlStatus(
    control.id
  );
  const hub = useHub(control.uuid);
  const openModal = useOpenModal();
  const retry = useRetryControls();
  const openConfig = () => openModal('controlConfig', { id: control.id });
  const { label, icon: Icon } = getDeviceType(device?.type.text);
  const waiting =
    controlTypes[control.type].mode && subscription?.state !== 'ready';
  let content: React.ReactNode = null;
  if (available && device)
    content = (
      <Box
        sx={{
          width: '100%',
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {renderWidget(control, device)}
      </Box>
    );
  if (!available) {
    content = (
      <Typography
        variant="caption"
        role="status"
        sx={{ alignSelf: 'center', textAlign: 'center' }}
      >
        {reason}
      </Typography>
    );
  } else if (waiting) {
    content = (
      <Box sx={{ alignSelf: 'center', textAlign: 'center' }}>
        {subscription?.error ? (
          <>
            <ControlError error={subscription.error} />
            <Button color="inherit" size="small" onClick={retry}>
              Retry sensor
            </Button>
          </>
        ) : (
          <Typography variant="caption" role="status">
            Connecting sensor
          </Typography>
        )}
      </Box>
    );
  }
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={`${control.id}-title`}
      sx={{
        ...tileSx(hub?.color),
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', minWidth: 0, px: 0.25 }}
      >
        <Tooltip disableInteractive title="Drag to move">
          <Box
            component="span"
            role="img"
            aria-label={`Move ${control.title}`}
            onPointerDown={(event) => onGesture?.(event, control, 'move')}
            sx={{
              display: 'inline-flex',
              p: '5px',
              cursor: 'grab',
              touchAction: 'none',
            }}
          >
            <DragIndicator fontSize="small" />
          </Box>
        </Tooltip>
        <Tooltip title={control.title} describeChild>
          <Typography
            id={`${control.id}-title`}
            variant="caption"
            noWrap
            sx={{ flex: 1, fontWeight: 'bold' }}
          >
            {control.title}
          </Typography>
        </Tooltip>
        <Tooltip title="Control settings">
          <IconButton
            size="small"
            aria-label={`Configure ${control.title}`}
            onClick={openConfig}
          >
            <Settings fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          px: 0.75,
          py: 0.25,
        }}
      >
        {content}
      </Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', minWidth: 0, pl: 0.75 }}
      >
        <Icon sx={{ fontSize: 12, mr: 0.5, flexShrink: 0 }} />
        <Tooltip
          title={`${hub?.name || control.uuid} - ${control.port} - ${label}`}
          describeChild
        >
          <Typography
            variant="caption"
            noWrap
            sx={{ flex: 1, color: 'text.secondary', fontSize: 10 }}
          >
            {control.port} - {hub?.name || control.uuid}
          </Typography>
        </Tooltip>
        <Tooltip disableInteractive title="Drag to resize">
          <Box
            component="span"
            role="img"
            aria-label={`Resize ${control.title}`}
            onPointerDown={(event) => onGesture?.(event, control, 'resize')}
            sx={{
              display: 'inline-flex',
              p: '5px',
              cursor: 'nwse-resize',
              touchAction: 'none',
            }}
          >
            <OpenInFull sx={{ fontSize: 16 }} />
          </Box>
        </Tooltip>
      </Box>
    </Paper>
  );
}

export default Control;
