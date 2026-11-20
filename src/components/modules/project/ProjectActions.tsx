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
import Download from '@mui/icons-material/Download';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Save from '@mui/icons-material/Save';
import UploadFile from '@mui/icons-material/UploadFile';
import {
  useAllControls,
  useActiveLocalSave,
  useHubs,
  useMarkProjectSaved,
  usePostMessage,
  useProjectBusy,
  useProjectDirty,
  useProjectSnapshot,
  useRestoreProject,
  useSetActiveLocalSave,
} from '../../../core/hooks';
import errorMessage from '../../../utils/error-message';
import {
  listSavedProjects,
  normalizeProjectName,
  PROJECT_FILE_SUFFIX,
  readSavedProject,
  saveProject,
  storageKeyForProject,
  type LocalProjectIdentity,
  type ProjectSnapshot,
  type SavedProject,
} from '../../../core/project';
import {
  prepareProjectImport,
  readProjectFile,
} from '../../../core/project-import';
import { downloadProject } from '../../../core/project-export';

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
    borderWidth: '2px',
  },
};

const projectDialogActionsSx = {
  color: 'text.primary',
  '& .MuiButton-root': { color: 'inherit' },
  '& .MuiButton-containedPrimary': { color: 'primary.contrastText' },
};

type ProjectDialog = 'save' | 'open';
type DialogExit = ProjectDialog | 'confirmation';

// Render project save, open, import, and export workflows.
function ProjectActions() {
  const hubs = useHubs();
  const allControls = useAllControls();
  const snapshotProject = useProjectSnapshot();
  const restoreProject = useRestoreProject();
  const markProjectSaved = useMarkProjectSaved();
  const postMessage = usePostMessage();
  const activeLocalSave = useActiveLocalSave();
  const setActiveLocalSave = useSetActiveLocalSave();
  const projectDirty = useProjectDirty();
  const projectDirtyRef = useRef(projectDirty);
  projectDirtyRef.current = projectDirty;
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
    'overwrite' | 'discard' | 'import' | null
  >(null);
  const [pendingSnapshot, setPendingSnapshot] =
    useState<ProjectSnapshot | null>(null);
  const [pendingLocalSave, setPendingLocalSave] =
    useState<LocalProjectIdentity | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    prepared: ReturnType<typeof prepareProjectImport>;
    discardsChanges: boolean;
  } | null>(null);
  const [readingImport, setReadingImport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirmationReturnFocus = useRef<HTMLElement | null>(null);
  const projectDialogRef = useRef(projectDialog);
  projectDialogRef.current = projectDialog;
  const confirmationRef = useRef(confirmation);
  confirmationRef.current = confirmation;
  const focusAfterExits = useRef<{
    target: HTMLElement | null;
    pending: Set<DialogExit>;
    requireClosedDialogs: boolean;
  } | null>(null);

  // Restore focus after the specified dialogs finish their exit transitions.
  const scheduleFocusAfterExits = (
    target: HTMLElement | null,
    dialogs: DialogExit[],
    requireClosedDialogs = false
  ) => {
    const pending = new Set(dialogs);
    if (pending.size === 0) {
      target?.focus();
      return;
    }
    focusAfterExits.current = { target, pending, requireClosedDialogs };
  };

  // Complete a pending focus restoration when one dialog exits.
  const restoreFocusAfterExit = (dialog: DialogExit) => {
    const plan = focusAfterExits.current;
    if (!plan || !plan.pending.delete(dialog) || plan.pending.size > 0) return;
    focusAfterExits.current = null;
    if (
      plan.requireClosedDialogs &&
      (projectDialogRef.current !== null || confirmationRef.current !== null)
    ) {
      return;
    }
    plan.target?.focus();
  };

  // Close the project dialog and any confirmation while scheduling focus.
  const closeProjectDialog = () => {
    if (projectBusy || readingImport || !projectDialog) return;
    if (confirmation !== null) {
      scheduleFocusAfterExits(
        returnFocus.current,
        [projectDialog, 'confirmation'],
        true
      );
      setConfirmation(null);
      setPendingSnapshot(null);
      setPendingLocalSave(null);
      setPendingImport(null);
    } else {
      scheduleFocusAfterExits(returnFocus.current, [projectDialog], true);
    }
    setProjectDialog(null);
  };

  // Close the confirmation dialog and clear its pending operation.
  const closeConfirmation = () => {
    if (projectBusy || confirmation === null) return;
    scheduleFocusAfterExits(confirmationReturnFocus.current, ['confirmation']);
    setConfirmation(null);
    setPendingSnapshot(null);
    setPendingLocalSave(null);
    setPendingImport(null);
  };

  // Close all project dialogs and reset their pending state.
  const closeAllDialogs = () => {
    const dialogs: DialogExit[] = [];
    if (projectDialog) dialogs.push(projectDialog);
    if (confirmation !== null) dialogs.push('confirmation');
    scheduleFocusAfterExits(returnFocus.current, dialogs, true);
    setProjectDialog(null);
    setConfirmation(null);
    setPendingSnapshot(null);
    setPendingLocalSave(null);
    setPendingImport(null);
    setProjectError('');
  };

  // Restore an imported project and commit its prepared local save.
  const importAndSave = async (
    prepared: ReturnType<typeof prepareProjectImport>
  ) => {
    try {
      await restoreProject(prepared.snapshot, prepared.commit);
      setActiveLocalSave(prepared.identity);
      closeAllDialogs();
    } catch (cause) {
      setProjectError(errorMessage(cause));
    }
  };

  // Read an import file and request confirmation when data may be replaced.
  const importFile = async (file: File) => {
    setReadingImport(true);
    setProjectError('');
    try {
      const prepared = prepareProjectImport(await readProjectFile(file));
      const discardsChanges = projectDirtyRef.current;
      if (prepared.replacesSave || discardsChanges) {
        confirmationReturnFocus.current = importButton.current;
        setPendingImport({ prepared, discardsChanges });
        setConfirmation('import');
      } else {
        await importAndSave(prepared);
      }
    } catch (cause) {
      setProjectError(errorMessage(cause));
    } finally {
      setReadingImport(false);
    }
  };

  // Ensure the current project has a hub or hub-linked control to save.
  const requireSaveSource = () => {
    if (!hasSaveSourceRef.current) {
      throw new Error(
        'Connect a hub or add a hub-linked control before saving a project.'
      );
    }
  };

  // Open the saved-project list and load its current entries.
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

  // Download the currently selected local project save.
  const downloadSavedProject = () => {
    if (!activeLocalSave || projectBusy) return;
    try {
      downloadProject(readSavedProject(activeLocalSave.id));
    } catch (cause) {
      postMessage({ level: 'error', text: errorMessage(cause) });
    }
  };

  // Save a project snapshot and mark it as the active local save.
  const writeProject = (snapshot: ProjectSnapshot, overwrite: boolean) => {
    requireSaveSource();
    saveProject(snapshot, { overwrite });
    markProjectSaved(snapshot);
    setActiveLocalSave({
      id: storageKeyForProject(snapshot.name),
      name: snapshot.name,
    });
    setProjectName(snapshot.name);
    closeAllDialogs();
  };

  // Restore a saved project and make it the active local save.
  const restoreSavedProject = async (
    snapshot: ProjectSnapshot,
    identity: LocalProjectIdentity
  ) => {
    try {
      await restoreProject(snapshot);
      setActiveLocalSave(identity);
      setProjectName(snapshot.name);
      closeAllDialogs();
    } catch (cause) {
      setProjectError(errorMessage(cause));
    }
  };

  // Validate the project name and save or request overwrite confirmation.
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
        setPendingLocalSave(null);
        setConfirmation('overwrite');
      } else {
        writeProject(snapshot, false);
      }
    } catch (cause) {
      setProjectError(errorMessage(cause));
    }
  };

  let confirmationTitle = 'Discard unsaved changes?';
  let confirmationAction = 'Discard and open';
  let confirmationMessage =
    `Open "${pendingSnapshot?.name}" and discard the current ` +
    'unsaved project changes.';
  if (confirmation === 'overwrite') {
    confirmationTitle = 'Overwrite saved project?';
    confirmationAction = 'Overwrite';
    const savedName = pendingSnapshot?.name;
    confirmationMessage = `Replace the saved project "${savedName}"?`;
  } else if (confirmation === 'import' && pendingImport) {
    confirmationTitle = 'Import and save project?';
    confirmationAction = 'Import and save';
    const { name: importedName } = pendingImport.prepared.identity;
    confirmationMessage = `Import and save "${importedName}"?`;
    if (pendingImport.prepared.replacesSave) {
      confirmationMessage +=
        ' This will replace the existing local save with the same name.';
    }
    if (pendingImport.discardsChanges || projectDirty) {
      confirmationMessage +=
        ' This will discard the current unsaved project changes.';
    }
  }

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
        <Tooltip
          title="Download last saved version (.wcp.json)"
          describeChild
          disableInteractive
        >
          <span style={{ display: 'inline-flex' }}>
            <IconButton
              aria-label="Download saved project"
              color="inherit"
              disabled={!activeLocalSave || projectBusy}
              onClick={downloadSavedProject}
              sx={{
                '&.Mui-focusVisible': {
                  outline: '2px solid currentColor',
                  outlineOffset: 2,
                },
              }}
            >
              <Download />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Dialog
        open={projectDialog === 'save'}
        sx={projectDialogSx}
        onClose={closeProjectDialog}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: () => restoreFocusAfterExit('save') },
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
            onClick={closeProjectDialog}
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
        onClose={closeProjectDialog}
        disableRestoreFocus
        slotProps={{
          transition: { onExited: () => restoreFocusAfterExit('open') },
        }}
        aria-labelledby="project-open-title"
      >
        <DialogTitle id="project-open-title" sx={{ color: 'text.primary' }}>
          Open project
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Projects are stored only in this browser and origin. Controls for
            disconnected devices remain visible but cannot operate them.
          </DialogContentText>
          {projectError && (
            <DialogContentText role="alert" sx={{ mt: 1, color: 'error.dark' }}>
              {projectError}
            </DialogContentText>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={PROJECT_FILE_SUFFIX}
            aria-label="Import project file"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file && !projectBusy && !readingImport) void importFile(file);
            }}
          />
          <Button
            ref={importButton}
            startIcon={<UploadFile />}
            color="inherit"
            sx={{ mt: 2, color: 'text.primary' }}
            disabled={projectBusy || readingImport}
            onClick={() => fileInput.current?.click()}
          >
            Import project
          </Button>
          {savedProjects.length ? (
            <List aria-label="Saved projects">
              {savedProjects.map((item) => (
                <ListItemButton
                  key={item.id}
                  disabled={Boolean(item.error) || projectBusy || readingImport}
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
              <DialogContentText color="text.secondary" sx={{ mt: 2 }}>
                No saved projects yet.
              </DialogContentText>
            )
          )}
        </DialogContent>
        <DialogActions sx={projectDialogActionsSx}>
          <Button
            color="inherit"
            disabled={projectBusy || readingImport}
            onClick={closeProjectDialog}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmation !== null}
        sx={projectDialogSx}
        onClose={closeConfirmation}
        disableRestoreFocus
        slotProps={{
          transition: {
            onExited: () => restoreFocusAfterExit('confirmation'),
          },
        }}
        aria-labelledby="project-confirm-title"
      >
        <DialogTitle id="project-confirm-title" sx={{ color: 'text.primary' }}>
          {confirmationTitle}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            {confirmationMessage}
          </DialogContentText>
          {projectError && (
            <DialogContentText role="alert" sx={{ color: 'error.dark' }}>
              {projectError}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions sx={projectDialogActionsSx}>
          <Button
            color="inherit"
            disabled={projectBusy}
            onClick={closeConfirmation}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={
              projectBusy ||
              (confirmation === 'import' ? !pendingImport : !pendingSnapshot) ||
              (confirmation === 'overwrite' && !hasSaveSource)
            }
            onClick={() => {
              if (confirmation === 'import') {
                if (pendingImport) void importAndSave(pendingImport.prepared);
                return;
              }
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
            {confirmationAction}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ProjectActions;
