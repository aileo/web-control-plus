import { useRef, useState } from 'react';
import { useCloseModal } from './useNavigation';
import errorMessage from '../../utils/error-message';
import type { DialogBusyProps } from '../../components/types';

// Manage one modal action's busy state, error reporting, and close behavior.
export default function useModalAction(
  onBusyChange: DialogBusyProps['onBusyChange']
) {
  const close = useCloseModal();
  // Block duplicate submits before the busy prop has time to rerender.
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Run a modal action once and expose its error and busy state.
  const run = async (action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setError(null);
    onBusyChange(true);
    try {
      await action();
      close();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      onBusyChange(false);
    }
  };
  return { close, error, clearError: () => setError(null), run };
}
