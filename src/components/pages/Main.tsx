import React, { useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Radio,
  RadioGroup,
  TextField,
  Toolbar,
  Tooltip,
} from '@mui/material';
import Edit from '@mui/icons-material/Edit';
import Settings from '@mui/icons-material/Settings';
import GraphicEq from '@mui/icons-material/GraphicEq';
import {
  BOARD_COLORS,
  type BoardColor,
  isBoardColor,
} from '../../core/board-colors';
import {
  useActiveBoards,
  useAddBoard,
  useBoards,
  usePostMessage,
  useRemoveBoard,
  useRenameBoard,
  useSelectBoard,
  useSelectedBoardId,
  useStopAll,
  useUpdateBoardSettings,
} from '../../hooks';
import errorMessage from '../../utils/errorMessage';
import Grid from '../modules/grid/Grid';

function Main() {
  const boards = useBoards();
  const selected = useSelectedBoardId();
  const active = useActiveBoards();
  const add = useAddBoard();
  const select = useSelectBoard();
  const rename = useRenameBoard();
  const updateSettings = useUpdateBoardSettings();
  const remove = useRemoveBoard();
  const stop = useStopAll();
  const postMessage = usePostMessage();
  const board = boards.find((item) => item.id === selected)!;
  const [dialog, setDialog] = useState<'rename' | 'settings' | 'remove' | null>(
    null
  );
  const [name, setName] = useState('');
  const [color, setColor] = useState<BoardColor | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const openDialog = (kind: 'rename' | 'settings', opener: HTMLElement) => {
    returnFocus.current = opener;
    setName(board.name);
    setColor(board.color);
    setError('');
    setDialog(kind);
  };
  const removeSelected = async () => {
    setBusy(true);
    try {
      await remove(selected);
      const next = boards.find((item) => item.id !== selected);
      returnFocus.current = next
        ? document.getElementById(`tab-${next.id}`)
        : null;
      setDialog(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % boards.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + boards.length) % boards.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = boards.length - 1;
    else return;
    event.preventDefault();
    select(boards[next].id);
    document.getElementById(`tab-${boards[next].id}`)?.focus();
  };
  const save = () => {
    try {
      if (dialog === 'rename') rename(selected, name);
      else updateSettings(selected, name, color);
      setDialog(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar position="static" color="primary">
        <Toolbar sx={{ minHeight: 48, gap: 1, flexWrap: 'wrap' }}>
          <Box
            role="tablist"
            aria-label="Boards"
            sx={{
              display: 'flex',
              flex: '1 1 200px',
              minWidth: 0,
              overflowX: 'auto',
              alignItems: 'stretch',
            }}
          >
            {boards.map((item, index) => {
              const isSelected = item.id === selected;
              let background = isSelected ? 'background.paper' : 'transparent';
              if (item.color) background = BOARD_COLORS[item.color].background;
              return (
                <Box
                  key={item.id}
                  role="presentation"
                  sx={{
                    display: 'flex',
                    flexShrink: 0,
                    alignItems: 'center',
                    bgcolor: background,
                    borderBottom: isSelected
                      ? '3px solid'
                      : '3px solid transparent',
                    borderColor: isSelected ? 'text.primary' : 'transparent',
                  }}
                >
                  <ButtonBase
                    role="tab"
                    id={`tab-${item.id}`}
                    aria-controls={`panel-${item.id}`}
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => select(item.id)}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                    sx={{
                      color: 'text.primary',
                      minHeight: 48,
                      minWidth: 90,
                      px: 2,
                      textTransform: 'uppercase',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineOffset: '-3px',
                      },
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        gap: 0.5,
                        alignItems: 'center',
                      }}
                    >
                      {item.name}
                      {active.has(item.id) && (
                        <GraphicEq
                          role="img"
                          aria-label="Motor commanded to run"
                          titleAccess="Motor commanded to run"
                          fontSize="small"
                        />
                      )}
                    </Box>
                  </ButtonBase>
                  {isSelected && (
                    <>
                      <Tooltip title="Rename board">
                        <IconButton
                          size="small"
                          aria-label={`Rename ${item.name}`}
                          onClick={(event) =>
                            openDialog('rename', event.currentTarget)
                          }
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Board settings">
                        <IconButton
                          size="small"
                          aria-label={`Settings for ${item.name}`}
                          onClick={(event) =>
                            openDialog('settings', event.currentTarget)
                          }
                        >
                          <Settings fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
          <Button color="inherit" onClick={add}>
            Add board
          </Button>
          <Button
            color="inherit"
            onClick={() => {
              void stop().catch((cause) =>
                postMessage({ level: 'error', text: errorMessage(cause) })
              );
            }}
          >
            Stop all motors
          </Button>
        </Toolbar>
      </AppBar>
      <Box
        role="tabpanel"
        id={`panel-${selected}`}
        aria-labelledby={`tab-${selected}`}
        sx={{ flex: 1, minHeight: 0, display: 'flex' }}
      >
        <Grid key={selected} />
      </Box>
      <Dialog
        open={dialog !== null}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: () => returnFocus.current?.focus() },
        }}
        aria-labelledby="board-dialog-title"
      >
        <DialogTitle id="board-dialog-title">
          {dialog === 'rename' && 'Rename board'}
          {dialog === 'settings' && 'Board settings'}
          {dialog === 'remove' && 'Remove board?'}
        </DialogTitle>
        <DialogContent>
          {dialog === 'remove' ? (
            <DialogContentText>
              Remove {board.name} and its controls? Motors bound to these
              controls will be stopped. {error}
            </DialogContentText>
          ) : (
            <>
              <TextField
                autoFocus
                label="Board name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={Boolean(error)}
                helperText={error}
                fullWidth
                margin="dense"
              />
              {dialog === 'settings' && (
                <FormControl sx={{ mt: 2 }}>
                  <FormLabel id="board-color-label">Tab color</FormLabel>
                  <RadioGroup
                    row
                    aria-labelledby="board-color-label"
                    value={color ?? ''}
                    onChange={(event) => {
                      const { value } = event.target;
                      if (value === '') setColor(undefined);
                      else if (isBoardColor(value)) setColor(value);
                    }}
                  >
                    <FormControlLabel
                      value=""
                      control={<Radio />}
                      label="Default"
                    />
                    {(Object.keys(BOARD_COLORS) as BoardColor[]).map((key) => (
                      <FormControlLabel
                        key={key}
                        value={key}
                        control={<Radio />}
                        label={
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <Box
                              component="span"
                              aria-hidden="true"
                              sx={{
                                width: 16,
                                height: 16,
                                bgcolor: BOARD_COLORS[key].background,
                                border: '1px solid',
                                borderColor: 'text.secondary',
                                borderRadius: '50%',
                              }}
                            />
                            {BOARD_COLORS[key].label}
                          </Box>
                        }
                      />
                    ))}
                  </RadioGroup>
                </FormControl>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {dialog === 'settings' && (
            <Button
              color="error"
              disabled={boards.length === 1}
              onClick={() => {
                setError('');
                if (board.controlIds.length) setDialog('remove');
                else void removeSelected();
              }}
            >
              Remove board
            </Button>
          )}
          <Button disabled={busy} onClick={() => setDialog(null)}>
            Cancel
          </Button>
          {dialog === 'remove' ? (
            <Button
              disabled={busy}
              onClick={() => {
                void removeSelected();
              }}
            >
              Remove
            </Button>
          ) : (
            <Button onClick={save}>Save</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Main;
