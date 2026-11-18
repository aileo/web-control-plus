import React, {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type PropsWithChildren,
} from 'react';
import type { ModalContextMap, ModalState } from '../core/types';
import contextHook from './contextHook';

type ModalName = keyof ModalContextMap;
type HubShortcutTarget = { uuid: string; element: HTMLButtonElement };
type OpenModal = {
  (name: 'boardHelp', context?: ModalContextMap['boardHelp']): void;
  (name: 'hubConfig', context: ModalContextMap['hubConfig']): void;
  (name: 'controlConfig', context: ModalContextMap['controlConfig']): void;
  (name: 'createControl', context: ModalContextMap['createControl']): void;
};
type NavigationContextValue = {
  modal: ModalState;
  openModal: OpenModal;
  closeModal: () => void;
  hubMenu: string | null;
  setHubMenu: Dispatch<SetStateAction<string | null>>;
  hubShortcut: RefObject<HubShortcutTarget | null>;
};

const navigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: PropsWithChildren) {
  const [modal, setModal] = useState<ModalState>({
    name: null,
    context: null,
  });
  const [hubMenu, setHubMenu] = useState<string | null>(null);
  const hubShortcut = useRef<HubShortcutTarget | null>(null);

  const openModal = useCallback(
    (name: ModalName, context?: ModalContextMap[ModalName]): void => {
      setHubMenu(null);
      if (name === 'boardHelp') {
        setModal({
          name,
          context:
            context && 'returnFocusId' in context
              ? { returnFocusId: context.returnFocusId }
              : undefined,
        });
      } else if (name === 'hubConfig') {
        if (!context || !('uuid' in context))
          throw new Error('Hub configuration requires a hub id');
        setModal({ name, context: { uuid: context.uuid } });
      } else if (name === 'controlConfig') {
        if (!context || !('id' in context))
          throw new Error('Control configuration requires a control id');
        setModal({ name, context: { id: context.id } });
      } else {
        if (!context || !('uuid' in context) || !('port' in context))
          throw new Error('Creating a control requires a device port');
        setModal({
          name,
          context: {
            uuid: context.uuid,
            port: context.port,
            returnFocusId: context.returnFocusId,
          },
        });
      }
    },
    []
  );
  const closeModal = useCallback(() => {
    setModal({ name: null, context: null });
  }, []);
  const value = useMemo(
    () => ({ modal, openModal, closeModal, hubMenu, setHubMenu, hubShortcut }),
    [modal, openModal, closeModal, hubMenu]
  );

  return (
    <navigationContext.Provider value={value}>
      {children}
    </navigationContext.Provider>
  );
}

const hookFactory = contextHook(
  navigationContext,
  'useNavigation must be used within a NavigationProvider'
);

export const useModal = hookFactory('modal');
export const useOpenModal = hookFactory('openModal');
export const useCloseModal = hookFactory('closeModal');
export const useHubMenu = hookFactory('hubMenu');
export const useSetHubMenu = hookFactory('setHubMenu');
export const useHubShortcut = hookFactory('hubShortcut');
