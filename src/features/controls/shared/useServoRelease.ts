import { useEffect, useRef } from 'react';

export default function useServoRelease(
  enabled: boolean,
  reference: symbol | null,
  center: () => Promise<void>
) {
  const held = useRef<string | number | null>(null);
  const clear = () => {
    held.current = null;
  };
  useEffect(() => {
    const cancel = () => {
      held.current = null;
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('board-input-release', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      window.removeEventListener('board-input-release', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [enabled, reference]);

  return {
    begin(token: string | number) {
      if (!enabled || held.current !== null) return false;
      held.current = token;
      return true;
    },
    release(token: string | number) {
      if (!enabled || reference === null || held.current !== token) return;
      clear();
      void center();
    },
    cancel(token: string | number) {
      if (held.current === token) clear();
    },
    clear,
  };
}
