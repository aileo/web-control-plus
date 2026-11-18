import React, { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Save from '@mui/icons-material/Save';
import {
  useAllControls,
  useActiveLocalSave,
  useMarkProjectSaved,
  useProjectBusy,
  useProjectDirty,
  useProjectSnapshot,
  useRestoreProject,
  useSetActiveLocalSave,
  useHubs,
} from '../hooks';
import errorMessage from '../utils/errorMessage';
import {
  listSavedProjects,
  normalizeProjectName,
  readSavedProject,
  saveProject,
  storageKeyForProject,
  type ProjectSnapshot,
  type LocalProjectIdentity,
  type SavedProject,
} from '../core/project';

const projectDialogSx = {
  '& .MuiButtonBase-root.Mui-focusVisible': {
    outline: '2px solid',
    outlineColor: 'info.main',
    outlineOffset: 2,
  },
  '& .MuiInputLabel-root.Mui-focused': { color: 'info.main' },
  '& .MuiInputLabel-root.Mui-focused.Mui-error': { color: 'info.main' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'info.main',
  },
};

const projectDialogActionsSx = {
  color: 'text.primary',
  '& .MuiButton-root': { color: 'inherit' },
  '& .MuiButton-containedPrimary': { color: 'primary.contrastText' },
};

function ProjectActions() {
  const hubs = useHubs();
  const allControls = useAllControls();
  const snapshotProject = useProjectSnapshot();
  const restoreProject = useRestoreProject();
  const markProjectSaved = useMarkProjectSaved();
  const activeLocalSave = useActiveLocalSave();
  const setActiveLocalSave = useSetActiveLocalSave();
  const projectDirty = useProjectDirty();
  const projectBusy = useProjectBusy();
  const hasSaveSource =
    [...hubs.values()].some((hub) => hub.online) ||
    [...allControls.values()].some((control) => Boolean(control.uuid));
  const hasSaveSourceRef = useRef(hasSaveSource);
  hasSaveSourceRef.current = hasSaveSource;

  const [projectDialog, setProjectDialog] = useState<'save' | 'open' | null>(
    null
  );
  const [projectName, setProjectName] = useState('');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectError, setProjectError] = useState('');
  const [confirmation, setConfirmation] = useState<
    'overwrite' | 'discard' | null
  >(null);
  const [pendingSnapshot, setPendingSnapshot] =
    useState<ProjectSnapshot | null>(null);
  const [pendingLocalSave, setPendingLocalSave] =
    useState<LocalProjectIdentity | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirmationReturnFocus = useRef<HTMLElement | null>(null);
  const projectDialogRef = useRef(projectDialog);
  projectDialogRef.current = projectDialog;
  const confirmationRef = useRef(confirmation);
  confirmationRef.current = confirmation;

  const restoreProjectActionFocus = () => {
    if (projectDialogRef.current === null && confirmationRef.current === null) {
      returnFocus.current?.focus();
    }
  };

  const restoreConfirmationFocus = () => {
    if (projectDialogRef.current !== null) {
      confirmationReturnFocus.current?.focus();
    } else if (confirmationRef.current === null) {
      returnFocus.current?.focus();
    }
  };

  const requireSaveSource = () => {
    if (!hasSaveSourceRef.current) {
      throw new Error(
        'Connect a hub or add a hub-linked control before saving a project.'
      );
    }
  };

  const openProjectList = (opener: HTMLElement) => {
    returnFocus.current = opener;
    setProjectError('');
    setProjectDialog('open');
    try {
      setSavedProjects(listSavedProjects());
    } catch (cause) {
      setProjectError(errorMessage(cause));
      setSavedProjects([]);
    }
  };

  const writeProject = (snapshot: ProjectSnapshot, overwrite: boolean) => {
    requireSaveSource();
    saveProject(snapshot, { overwrite });
    markProjectSaved(snapshot);
    setActiveLocalSave({
      id: storageKeyForProject(snapshot.name),
      name: snapshot.name,
    });
    setProjectName(snapshot.name);
    setProjectDialog(null);
    setConfirmation(null);
    setPendingSnapshot(null);
    setPendingLocalSave(null);
    setProjectError('');
  };

  const restoreSavedProject = async (
    snapshot: ProjectSnapshot,
    identity: LocalProjectIdentity
  ) => {
    try {
      await restoreProject(snapshot);
      setActiveLocalSave(identity);
      setProjectName(snapshot.name);
      setProjectDialog(null);
      setConfirmation(null);
      setPendingSnapshot(null);
      setPendingLocalSave(null);
      setProjectError('');
    } catch (cause) {
      setProjectError(errorMessage(cause));
    }
  };

  const save = (opener: HTMLElement) => {
    try {
      requireSaveSource();
      const normalizedName = normalizeProjectName(projectName);
      const snapshot = snapshotProject(normalizedName);
      const key = storageKeyForProject(normalizedName);
      const exists = listSavedProjects().some((item) => item.id === key);
      if (key === activeLocalSave?.id) {
        writeProject(snapshot, true);
      } else if (exists) {
        confirmationReturnFocus.current = opener;
        setPendingSnapshot(snapshot);
        setConfirmation('overwrite');
      } else {
        writeProject(snapshot, false);
      }
    } catch (cause) {
      setProjectError(errorMessage(cause));
    }
  };

  return (
    <>
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}
      >
        <Tooltip title="Save project" describeChild disableInteractive>
          <span style={{ display: 'inline-flex' }}>
            <IconButton
              aria-label="Save project"
              color="inherit"
              disabled={!hasSaveSource || projectBusy}
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                setProjectName(activeLocalSave?.name ?? '');
                setProjectError('');
                setProjectDialog('save');
              }}
            >
              <Save />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Open project" describeChild disableInteractive>
          <IconButton
            aria-label="Open project"
            color="inherit"
            disabled={projectBusy}
            onClick={(event) => openProjectList(event.currentTarget)}
          >
            <FolderOpen />
          </IconButton>
        </Tooltip>
      </Stack>
      <Dialog
        open={projectDialog === 'save'}
        sx={projectDialogSx}
        onClose={() => {
          if (!projectBusy) setProjectDialog(null);
        }}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: restoreProjectActionFocus },
        }}
        aria-labelledby="project-save-title"
      >
        <DialogTitle id="project-save-title" sx={{ color: 'text.primary' }}>
          Save project
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Save every board and control in this browser. Live hardware state is
            never saved.
          </DialogContentText>
          <TextField
            autoFocus
            label="Project name"
            value={projectName}
            onChange={(event) => {
              setProjectName(event.target.value);
              setProjectError('');
            }}
            error={Boolean(projectError)}
            helperText={projectError}
            fullWidth
            sx={{
              mt: 2,
              '& .MuiInputLabel-root': { color: 'text.secondary' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'info.main' },
              '& .MuiInputLabel-root.Mui-focused.Mui-error': {
                color: 'info.main',
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={projectDialogActionsSx}>
          <Button
            color="inherit"
            disabled={projectBusy}
            onClick={() => setProjectDialog(null)}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={!hasSaveSource || projectBusy}
            onClick={(event) => save(event.currentTarget)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={projectDialog === 'open'}
        sx={projectDialogSx}
        onClose={() => {
          if (!projectBusy) setProjectDialog(null);
        }}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: restoreProjectActionFocus },
        }}
        aria-labelledby="project-open-title"
      >
        <DialogTitle id="project-open-title" sx={{ color: 'text.primary' }}>
          Open project
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Projects are stored only in this browser and origin. Opening does
            not connect hardware; saved hubs and devices remain visible, and
            disconnected controls cannot operate them.
          </DialogContentText>
          {projectError && (
            <DialogContentText role="alert" sx={{ mt: 1, color: 'error.dark' }}>
              {projectError}
            </DialogContentText>
          )}
          {savedProjects.length ? (
            <List aria-label="Saved projects">
              {savedProjects.map((item) => (
                <ListItemButton
                  key={item.id}
                  disabled={Boolean(item.error) || projectBusy}
                  sx={{
                    color: 'text.primary',
                    '& .MuiListItemText-primary': { color: 'text.primary' },
                    '& .MuiListItemText-secondary': {
                      color: item.error ? 'error.dark' : 'text.secondary',
                    },
                  }}
                  onClick={(event) => {
                    try {
                      const snapshot = readSavedProject(item.id);
                      const identity = { id: item.id, name: snapshot.name };
                      if (projectDirty) {
                        confirmationReturnFocus.current = event.currentTarget;
                        setPendingSnapshot(snapshot);
                        setPendingLocalSave(identity);
                        setConfirmation('discard');
                      } else {
                        void restoreSavedProject(snapshot, identity);
                      }
                    } catch (cause) {
                      setProjectError(errorMessage(cause));
                    }
                  }}
                >
                  <ListItemText
                    primary={item.name}
                    secondary={item.error || 'Saved in this browser'}
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            !projectError && (
              <DialogContentText sx={{ mt: 2, color: 'text.secondary' }}>
                No saved projects yet.
              </DialogContentText>
            )
          )}
        </DialogContent>
        <DialogActions sx={projectDialogActionsSx}>
          <Button
            color="inherit"
            disabled={projectBusy}
            onClick={() => setProjectDialog(null)}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmation !== null}
        sx={projectDialogSx}
        onClose={() => {
          if (!projectBusy) {
            setConfirmation(null);
            setPendingSnapshot(null);
            setPendingLocalSave(null);
          }
        }}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: restoreConfirmationFocus },
        }}
        aria-labelledby="project-confirm-title"
      >
        <DialogTitle id="project-confirm-title" sx={{ color: 'text.primary' }}>
          {confirmation === 'overwrite'
            ? 'Overwrite saved project?'
            : 'Discard unsaved changes?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            {confirmation === 'overwrite'
              ? `Replace the saved project "${pendingSnapshot?.name}"?`
              : `Open "${pendingSnapshot?.name}" and discard the current ` +
                'unsaved project changes?'}
            {projectError && ` ${projectError}`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={projectDialogActionsSx}>
          <Button
            color="inherit"
            disabled={projectBusy}
            onClick={() => {
              setConfirmation(null);
              setPendingSnapshot(null);
              setPendingLocalSave(null);
            }}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={
              projectBusy ||
              !pendingSnapshot ||
              (confirmation === 'overwrite' && !hasSaveSource)
            }
            onClick={() => {
              if (!pendingSnapshot) return;
              if (confirmation === 'overwrite') {
                try {
                  writeProject(pendingSnapshot, true);
                } catch (cause) {
                  setProjectError(errorMessage(cause));
                }
              } else if (pendingLocalSave) {
                void restoreSavedProject(pendingSnapshot, pendingLocalSave);
              } else {
                setProjectError('Could not identify the saved project.');
              }
            }}
          >
            {confirmation === 'overwrite' ? 'Overwrite' : 'Discard and open'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ProjectActions;
