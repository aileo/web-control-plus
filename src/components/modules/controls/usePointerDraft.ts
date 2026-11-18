import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

// Preview locally; cancelled pointer gestures never become output commands.
export default function usePointerDraft<T>(
  value: T,
  commit: (next: T) => void
) {
  const [draft, setDraft] = useState<T | null>(null);
  const held = useRef<{ pointerId: number; value: T } | null>(null);
  const cancel = useCallback(() => {
    held.current = null;
    setDraft(null);
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hide);
    return () => {
      held.current = null;
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [cancel]);
  const preview = (next: T) => {
    if (!held.current) return;
    held.current.value = next;
    setDraft(next);
  };
  return {
    value: draft ?? value,
    active: () => held.current !== null,
    start: (event: PointerEvent<HTMLElement>, next: T) => {
      if (event.button !== 0 || event.isPrimary === false || held.current)
        return;
      held.current = { pointerId: event.pointerId, value: next };
      setDraft(next);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    move: (event: PointerEvent<HTMLElement>, next: T) => {
      if (held.current?.pointerId === event.pointerId) preview(next);
    },
    preview,
    finish: (event: PointerEvent<HTMLElement>, next?: T) => {
      const { current } = held;
      if (!current || current.pointerId !== event.pointerId) return;
      cancel();
      commit(next ?? current.value);
    },
    cancel: (event: PointerEvent<HTMLElement>) => {
      if (held.current?.pointerId === event.pointerId) cancel();
    },
  };
}
