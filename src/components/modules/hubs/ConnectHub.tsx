import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material';
import AddLink from '@mui/icons-material/AddLink';
import errorMessage from '../../../utils/errorMessage';
import logger from '../../../utils/logger';
import { matchingOfflineHubUuids } from '../../../core/hub-replacement';
import {
  useAddHub,
  useConnectingHub,
  useDevices,
  useHubs,
  usePostMessage,
  useReplaceOfflineHubControls,
  useSetHubMenu,
} from '../../../hooks';
import type { HubInfo } from '../../../core/types';

type ReplacementPrompt = {
  newUuid: string;
  candidateUuids: string[];
};

type InventoryDevice = { type: { num: number }; connected: boolean };

function inventorySummary(
  inventory: ReadonlyMap<string, InventoryDevice> | undefined
) {
  return [...(inventory || [])]
    .map(([port, device]) => ({
      port,
      type: device.type.num,
      connected: device.connected,
    }))
    .sort((first, second) => first.port.localeCompare(second.port));
}

function ConnectHub() {
  const add = useAddHub();
  const connecting = useConnectingHub();
  const hubs = useHubs();
  const devices = useDevices();
  const postMessage = usePostMessage();
  const replaceOfflineHub = useReplaceOfflineHubControls();
  const setHubMenu = useSetHubMenu();
  const [awaitingInventory, setAwaitingInventory] = useState<string | null>(
    null
  );
  const [replacement, setReplacement] = useState<ReplacementPrompt | null>(
    null
  );
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const lastInventoryLog = useRef<string | null>(null);

  useEffect(() => {
    if (!awaitingInventory) return;
    const newHub = hubs.get(awaitingInventory);
    if (!newHub) return;
    if (!newHub.online) {
      logger.info(
        'Replacement discovery stopped because the new hub disconnected',
        {
          hub: newHub.name || 'Unnamed hub',
          connectionOrder: newHub.connectionOrder,
        }
      );
      setAwaitingInventory(null);
      return;
    }
    const inventory = devices.get(awaitingInventory);
    const diagnostic = [...hubs.values()]
      .map((hub) => ({
        name: hub.name || 'Unnamed hub',
        connectionOrder: hub.connectionOrder,
        type: hub.type.num,
        online: hub.online,
        devices: inventorySummary(devices.get(hub.uuid)),
      }))
      .sort((first, second) => first.connectionOrder - second.connectionOrder);
    const diagnosticKey = JSON.stringify(diagnostic);
    if (diagnosticKey !== lastInventoryLog.current) {
      logger.debug('Evaluating disconnected hub replacement', {
        newHub: {
          name: newHub.name || 'Unnamed hub',
          connectionOrder: newHub.connectionOrder,
          type: newHub.type.num,
          inventoryReady: Boolean(inventory),
        },
        hubs: diagnostic,
      });
      lastInventoryLog.current = diagnosticKey;
    }
    if (!inventory) return;
    const candidateUuids = matchingOfflineHubUuids(
      awaitingInventory,
      hubs,
      devices
    );
    if (candidateUuids.length) {
      logger.info('Found matching disconnected hub', {
        newHub: {
          name: newHub.name || 'Unnamed hub',
          connectionOrder: newHub.connectionOrder,
        },
        candidates: candidateUuids.map((uuid) => {
          const candidate = hubs.get(uuid);
          return {
            name: candidate?.name || 'Unnamed hub',
            connectionOrder: candidate?.connectionOrder,
          };
        }),
      });
      setAwaitingInventory(null);
      setSelectedCandidate(
        candidateUuids.length === 1 ? candidateUuids[0] : ''
      );
      setReplacement({ newUuid: awaitingInventory, candidateUuids });
      setReplacementError(null);
    }
  }, [awaitingInventory, devices, hubs]);

  const availableCandidates = replacement
    ? replacement.candidateUuids
        .map((uuid) => hubs.get(uuid))
        .filter((hub): hub is HubInfo => Boolean(hub && !hub.online))
    : [];
  const selectedHub = availableCandidates.find(
    (hub) => hub.uuid === selectedCandidate
  );
  const connectedHub = replacement ? hubs.get(replacement.newUuid) : undefined;
  const matchDescription =
    availableCandidates.length > 1
      ? 'Several disconnected hubs match this hub type and device layout. ' +
        'Choose which one to replace.'
      : `The connected hub matches ${
          selectedHub?.name || selectedCandidate
        } by type and attached devices on the same ports.`;
  const replacementDetails =
    ' The connected hub keeps its current name and ' +
    'inherits the saved color.';

  const connect = async () => {
    try {
      const hub = await add();
      logger.info('Replacement discovery started for connected hub', {
        name: hub.name || 'Unnamed hub',
        type: hub.type,
      });
      postMessage({
        text: `${hub.name || hub.uuid} connected`,
        level: 'success',
      });
      setHubMenu(hub.uuid);
      setAwaitingInventory(hub.uuid);
    } catch (cause) {
      postMessage({
        text: errorMessage(cause),
        level: 'error',
        duration: 6000,
      });
    }
  };
  const cancelReplacement = () => {
    if (replacementBusy) return;
    setReplacement(null);
    setSelectedCandidate('');
    setReplacementError(null);
  };
  const confirmReplacement = async () => {
    if (!replacement || !selectedCandidate || replacementBusy) return;
    setReplacementBusy(true);
    setReplacementError(null);
    try {
      await replaceOfflineHub(selectedCandidate, replacement.newUuid);
      const replacedName =
        hubs.get(selectedCandidate)?.name || selectedCandidate;
      postMessage({
        text: `${replacedName} replaced`,
        level: 'success',
      });
      setReplacement(null);
      setSelectedCandidate('');
    } catch (cause) {
      setReplacementError(errorMessage(cause));
    } finally {
      setReplacementBusy(false);
    }
  };
  const icon = connecting ? (
    <CircularProgress size={24} color="inherit" />
  ) : (
    <AddLink />
  );
  return (
    <>
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
      <Dialog
        open={Boolean(replacement)}
        onClose={cancelReplacement}
        aria-labelledby="replace-offline-hub-title"
        aria-describedby="replace-offline-hub-description"
      >
        <DialogTitle id="replace-offline-hub-title">
          Replace disconnected hub?
        </DialogTitle>
        <DialogContent>
          {replacementError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {replacementError}
            </Alert>
          )}
          {availableCandidates.length > 1 && (
            <TextField
              select
              fullWidth
              autoFocus
              label="Hub to replace"
              value={selectedCandidate}
              disabled={replacementBusy}
              onChange={(event) => setSelectedCandidate(event.target.value)}
              sx={{ mb: 2, mt: 1 }}
            >
              {availableCandidates.map((candidate) => (
                <MenuItem key={candidate.uuid} value={candidate.uuid}>
                  {candidate.name || candidate.uuid}
                </MenuItem>
              ))}
            </TextField>
          )}
          <DialogContentText id="replace-offline-hub-description">
            {matchDescription}
            {replacementDetails}
          </DialogContentText>
          {!connectedHub?.online && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              The new hub disconnected. Replacement is unavailable.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={replacementBusy} onClick={cancelReplacement}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={replacementBusy || !selectedHub || !connectedHub?.online}
            onClick={confirmReplacement}
          >
            {replacementBusy ? 'Replacing...' : 'Replace hub'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ConnectHub;
