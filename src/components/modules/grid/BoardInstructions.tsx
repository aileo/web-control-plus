import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  useBoardInstructions,
  useDismissInstructions,
  useHelpVisibilityPreference,
  useModal,
  useOpenModal,
  useCloseModal,
  useLatestConnectedHub,
  useSetHubMenu,
  useHubMenu,
  useHubShortcut,
} from '../../../hooks';
import { INSTRUCTIONS_TILE } from '../../../core/control-layout';
import { tileSx } from '../../../theme/lego';
import ConnectHub from '../hubs/ConnectHub';
import HubButton from '../hubs/HubButton';
import InstructionStep from './InstructionStep';
import BoardHelp from './BoardHelp';
import type { BoardRef } from '../../types';

const steps = [
  'Connect your hub. Use the yellow button in the top bar, or here.',
  'Open a hub menu: use its colored button in the top bar, or here.' +
    ' Choose a device.',
  'Pick a control, then a tile size.',
  'Drag the handles to move or resize your tiles.',
];
const sessionNote = 'Your controls last until you refresh this page.';

function BoardInstructions({ boardRef }: { boardRef: BoardRef }) {
  const { x, y, w, h } = INSTRUCTIONS_TILE;
  const visible = useBoardInstructions();
  const dismiss = useDismissInstructions();
  const preference = useHelpVisibilityPreference();
  const modal = useModal();
  const openModal = useOpenModal();
  const close = useCloseModal();
  const latestHub = useLatestConnectedHub();
  const setHubMenu = useSetHubMenu();
  const hubMenu = useHubMenu();
  const shortcut = useHubShortcut();
  const helpOpener = useRef('board-more-help');
  const hubLabel = latestHub && (latestHub.name || latestHub.uuid);
  const open = modal.name === 'boardHelp';
  useEffect(() => {
    if (modal.name === 'boardHelp')
      helpOpener.current = modal.context?.returnFocusId || 'board-more-help';
  }, [modal]);
  const hide = () => {
    close();
    dismiss();
    boardRef.current?.focus();
  };
  const remember = (
    <FormControlLabel
      label="Do not show again"
      sx={{ m: 0, alignSelf: 'flex-start', minHeight: 32 }}
      slotProps={{ typography: { variant: 'caption' } }}
      control={
        <Checkbox
          size="small"
          sx={{
            p: 0.5,
            '&.Mui-focusVisible': {
              outline: '2px solid',
              outlineColor: 'text.primary',
              outlineOffset: 1,
            },
          }}
          checked={preference.hidden}
          onChange={(event) => preference.remember(event.target.checked)}
        />
      }
    />
  );
  return (
    <>
      {visible && (
        <Box
          data-board-instructions
          sx={{
            zIndex: 1,
            minWidth: 0,
            minHeight: 0,
            gridColumn: `${x + 1} / span ${w}`,
            gridRow: `${y + 1} / span ${h}`,
            ...tileSx(),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            p: 2,
            gap: 0.5,
          }}
        >
          <Typography
            component="span"
            variant="h6"
            sx={{ color: 'info.main', fontWeight: 800 }}
          >
            How it works
          </Typography>
          <Box
            component="ol"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {steps.map((step, index) => (
              <InstructionStep key={step} number={index + 1}>
                <Box
                  sx={{
                    minWidth: 0,
                    ...((index === 0 || index === 1) && {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }),
                  }}
                >
                  <Typography component="div" variant="body2">
                    {step}
                  </Typography>
                  {index === 0 && <ConnectHub />}
                  {index === 1 && latestHub && (
                    <Tooltip disableInteractive title={hubLabel}>
                      <HubButton
                        hub={latestHub}
                        ref={(element) => {
                          shortcut.current = element
                            ? { element, uuid: latestHub.uuid }
                            : null;
                        }}
                        aria-label={`Open ${hubLabel} hub menu`}
                        aria-haspopup="dialog"
                        aria-expanded={hubMenu === latestHub.uuid}
                        onClick={() => setHubMenu(latestHub.uuid)}
                      />
                    </Tooltip>
                  )}
                </Box>
              </InstructionStep>
            ))}
          </Box>
          <Typography component="span" variant="caption">
            {sessionNote}
          </Typography>
          {remember}
          {preference.error && (
            <Alert severity="warning">{preference.error}</Alert>
          )}
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
          >
            <Button
              id="board-more-help"
              color="inherit"
              aria-label="How to use this board"
              onClick={() =>
                openModal('boardHelp', { returnFocusId: 'board-more-help' })
              }
            >
              More help
            </Button>
            <Button color="inherit" variant="outlined" onClick={hide}>
              Dismiss tile
            </Button>
          </Box>
        </Box>
      )}
      <Dialog
        open={open}
        onClose={close}
        aria-labelledby="board-help-title"
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              ...tileSx(),
              m: { xs: 1, sm: 3 },
              width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 48px)' },
              maxHeight: {
                xs: 'calc(100dvh - 16px)',
                sm: 'calc(100dvh - 48px)',
              },
            },
          },
          transition: {
            onExited: () => {
              const opener = document.getElementById(helpOpener.current);
              (opener || boardRef.current)?.focus();
            },
          },
        }}
      >
        <DialogTitle id="board-help-title">How it works</DialogTitle>
        <DialogContent dividers>
          <BoardHelp />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={close}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default BoardInstructions;
