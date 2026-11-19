import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import {
  useAddControl,
  useBoardOccupancy,
  useDevice,
  useHub,
} from '../../hooks';
import { getControlTypes } from '../../core/controlTypes';
import { findSpace } from '../../core/control-layout';
import { getDeviceType } from '../../utils/deviceTypes';
import { legoColors } from '../../theme/lego';
import ControlPreview from '../modules/controls/ControlPreview';
import Size, { SizePreview } from '../modules/controls/Size';
import type { ControlType, Size as TileSize } from '../../core/types';
import type { DialogBusyProps } from '../types';
import useModalAction from './useModalAction';

const previews = '& [data-control-preview], & [data-size-preview]';
const zoom = { [previews]: { transform: 'scale(1.03)' } };

const choiceSx = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  width: '100%',
  minHeight: 196,
  gap: 1,
  p: 1.5,
  borderRadius: 1,
  border: '2px solid transparent',
  color: legoColors.dark,
  [previews]: { transition: 'transform 150ms ease-out' },
  '@media (hover: hover)': { '&:not(.Mui-disabled):hover': zoom },
  '&.Mui-focusVisible': {
    ...zoom,
    borderColor: legoColors.blue,
    outline: `2px solid ${legoColors.dark}`,
  },
  '@media (prefers-reduced-motion: reduce)': {
    [previews]: { transition: 'none', transform: 'none !important' },
  },
  '&.Mui-disabled': { opacity: 0.45 },
};

function CreateControl({
  uuid,
  port,
  busy,
  onBusyChange,
}: DialogBusyProps & {
  uuid: string;
  port: string;
}) {
  const device = useDevice(uuid, port);
  const hub = useHub(uuid);
  const controls = useBoardOccupancy();
  const add = useAddControl();
  const { close, error, clearError, run } = useModalAction(onBusyChange);
  const proposals = getControlTypes(device);
  const [type, setType] = useState<ControlType | null>(null);
  const definition = proposals.find((value) => value.type === type);
  const available = hub?.online && device?.connected;
  const choices = definition ? [definition] : proposals;
  const full =
    choices.length > 0 &&
    !choices.some((value) =>
      value.sizes.some((size) => findSpace(controls, size))
    );
  const create = (size: TileSize) => {
    if (type) run(() => add({ type, uuid, port, ...size }));
  };
  const firstSize = definition?.sizes.find((size) => findSpace(controls, size));
  return (
    <>
      <DialogTitle id="control-dialog-title">
        {type ? 'Choose a tile size' : 'Choose a control'}
      </DialogTitle>
      <DialogContent
        dividers
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        <Typography>
          {hub?.name || uuid} - {port} -{' '}
          {getDeviceType(device?.type.text).label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {type
            ? 'Click a size to add the tile to your board.'
            : 'Choose a control. Previews never operate your device.'}
        </Typography>
        {!available && (
          <Alert severity="warning">This device is disconnected.</Alert>
        )}
        {available && !proposals.length && (
          <Alert severity="warning">
            No compatible control for this device.
          </Alert>
        )}
        {type && !definition && available && (
          <Alert severity="warning">
            Device changed. Go back to choose a compatible control.
          </Alert>
        )}
        {full && (
          <Alert severity="warning">
            Board full: no space for this control. Move, resize, remove another
            control or add new board.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box
          role="group"
          aria-label={type ? 'Tile sizes' : 'Control types'}
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          }}
        >
          {!type &&
            proposals.map((proposal, index) => (
              <ButtonBase
                key={proposal.type}
                type="button"
                autoFocus={index === 0}
                aria-label={`Choose ${proposal.label}`}
                disabled={busy || !available}
                sx={choiceSx}
                onClick={() => {
                  setType(proposal.type);
                  clearError();
                }}
              >
                <ControlPreview type={proposal.type} hubColor={hub?.color} />
                <Typography component="span" variant="subtitle2">
                  {proposal.label}
                </Typography>
              </ButtonBase>
            ))}
          {definition?.sizes.map((size) => {
            const fits = Boolean(findSpace(controls, size));
            const sizeLabel = `${size.w} by ${size.h}`;
            return (
              <ButtonBase
                key={`${size.w}x${size.h}`}
                type="button"
                aria-label={`Create ${definition.label}, ${sizeLabel}`}
                autoFocus={firstSize === size}
                disabled={busy || !available || !fits}
                onClick={() => create(size)}
                sx={choiceSx}
              >
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    py: 0.5,
                  }}
                >
                  <SizePreview w={size.w} h={size.h} hubColor={hub?.color} />
                </Box>
                <Typography component="span" variant="caption">
                  <Size w={size.w} h={size.h} />
                </Typography>
                {!fits && (
                  <Typography component="span" variant="caption">
                    No space
                  </Typography>
                )}
              </ButtonBase>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        {type && (
          <Button
            color="inherit"
            disabled={busy}
            onClick={() => {
              setType(null);
              clearError();
            }}
          >
            Back
          </Button>
        )}
        <Button color="inherit" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </DialogActions>
    </>
  );
}

export default CreateControl;
