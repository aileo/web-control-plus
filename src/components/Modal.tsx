import React, { useEffect, useState } from 'react';
import { Dialog } from '@mui/material';
import { useCloseModal, useModal } from '../hooks';
import type { ModalState } from '../core/types';
import CreateControl from './modals/CreateControl';
import ControlConfig from './modals/ControlConfig';
import HubConfig from './modals/HubConfig';

type SettingsModal = Exclude<ModalState, { name: null | 'boardHelp' }>;

function ControlDialog({ modal }: { modal: SettingsModal }) {
  const close = useCloseModal();
  const [busy, setBusy] = useState(false);
  const returnFocusId =
    modal.name === 'createControl' ? modal.context.returnFocusId : undefined;
  useEffect(
    () => () => {
      if (returnFocusId) document.getElementById(returnFocusId)?.focus();
    },
    [returnFocusId]
  );
  const common = { busy, onBusyChange: setBusy };
  let content: React.ReactNode;
  switch (modal.name) {
    case 'createControl':
      content = <CreateControl {...modal.context} {...common} />;
      break;
    case 'controlConfig':
      content = <ControlConfig {...modal.context} {...common} />;
      break;
    case 'hubConfig':
      content = <HubConfig {...modal.context} {...common} />;
      break;
    default: {
      const unreachable: never = modal;
      throw new Error(`Unknown settings dialog: ${String(unreachable)}`);
    }
  }
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      aria-labelledby="control-dialog-title"
      disableRestoreFocus={Boolean(returnFocusId)}
      onClose={() => {
        if (!busy) close();
      }}
    >
      {content}
    </Dialog>
  );
}

function Modal() {
  const modal = useModal();
  return modal.name && modal.name !== 'boardHelp' ? (
    <ControlDialog
      key={`${modal.name}:${JSON.stringify(modal.context)}`}
      modal={modal}
    />
  ) : null;
}

export default Modal;
