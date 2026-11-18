import { useRef, useState } from 'react';
import { useCloseModal } from '../../hooks';
import errorMessage from '../../utils/errorMessage';
import type { DialogBusyProps } from '../types';

export default function useModalAction(
  onBusyChange: DialogBusyProps['onBusyChange']
) {
  const close = useCloseModal();
  // Block duplicate submits before the busy prop has time to rerender.
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
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
