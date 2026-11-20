export type ModalContextMap = {
  hubConfig: { uuid: string };
  controlConfig: { id: string };
  createControl: { uuid: string; port: string; returnFocusId?: string };
  boardHelp: { returnFocusId?: string } | undefined;
};

export type ModalState =
  | { name: null; context: null }
  | {
      [K in keyof ModalContextMap]: {
        name: K;
        context: ModalContextMap[K];
      };
    }[keyof ModalContextMap];
