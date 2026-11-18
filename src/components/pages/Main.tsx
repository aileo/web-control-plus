import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import GraphicEq from '@mui/icons-material/GraphicEq';
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
  const remove = useRemoveBoard();
  const stop = useStopAll();
  const postMessage = usePostMessage();
  const board = boards.find((item) => item.id === selected)!;
  const [dialog, setDialog] = useState<'rename' | 'remove' | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const removeSelected = async () => {
    setBusy(true);
    try {
      await remove(selected);
      setDialog(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', px: 1 }}
      >
        <Tabs
          value={selected}
          onChange={(_, id: string) => select(id)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Boards"
        >
          {boards.map((item) => (
            <Tab
              key={item.id}
              id={`tab-${item.id}`}
              aria-controls={`panel-${item.id}`}
              value={item.id}
              label={
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
              }
            />
          ))}
        </Tabs>
        <Button onClick={add}>Add board</Button>
        <Button
          onClick={() => {
            setName(board.name);
            setError('');
            setDialog('rename');
          }}
        >
          Rename board
        </Button>
        <Button
          disabled={boards.length === 1}
          onClick={() => {
            setError('');
            if (board.controlIds.length) setDialog('remove');
            else void removeSelected();
          }}
        >
          Remove board
        </Button>
        <Button
          color="error"
          onClick={() => {
            void stop().catch((cause) =>
              postMessage({ level: 'error', text: errorMessage(cause) })
            );
          }}
        >
          Stop all motors
        </Button>
      </Box>
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
        aria-labelledby="board-dialog-title"
      >
        <DialogTitle id="board-dialog-title">
          {dialog === 'rename' ? 'Rename board' : 'Remove board?'}
        </DialogTitle>
        <DialogContent>
          {dialog === 'rename' ? (
            <TextField
              autoFocus
              label="Board name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={Boolean(error)}
              helperText={error}
              fullWidth
            />
          ) : (
            <DialogContentText>
              Remove {board.name} and its controls? Motors bound to these
              controls will be stopped. {error}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDialog(null)}>
            Cancel
          </Button>
          {dialog === 'rename' ? (
            <Button
              onClick={() => {
                try {
                  rename(selected, name);
                  setDialog(null);
                } catch (cause) {
                  setError(errorMessage(cause));
                }
              }}
            >
              Save
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() => {
                void removeSelected();
              }}
            >
              Remove
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Main;
