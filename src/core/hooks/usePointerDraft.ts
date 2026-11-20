import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

// Track pointer drafts locally and commit only completed gestures.
export default function usePointerDraft<T>(
  value: T,
  commit: (next: T) => void
) {
  const [draft, setDraft] = useState<T | null>(null);
  const held = useRef<{ pointerId: number; value: T } | null>(null);
  // Discard the active draft without committing it.
  const cancel = useCallback(() => {
    held.current = null;
    setDraft(null);
  }, []);
  useEffect(() => {
    // Cancel a draft when the document becomes hidden.
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
  // Update the draft value while a pointer gesture is active.
  const preview = (next: T) => {
    if (!held.current) return;
    held.current.value = next;
    setDraft(next);
  };
  return {
    value: draft ?? value,
    // Report whether a pointer gesture is currently held.
    active: () => held.current !== null,
    // Begin a draft for a primary pointer gesture.
    start: (event: PointerEvent<HTMLElement>, next: T) => {
      if (event.button !== 0 || event.isPrimary === false || held.current)
        return;
      held.current = { pointerId: event.pointerId, value: next };
      setDraft(next);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    // Update the draft only for the pointer that started the gesture.
    move: (event: PointerEvent<HTMLElement>, next: T) => {
      if (held.current?.pointerId === event.pointerId) preview(next);
    },
    preview,
    // Commit the completed draft and release pointer state.
    finish: (event: PointerEvent<HTMLElement>, next?: T) => {
      const { current } = held;
      if (!current || current.pointerId !== event.pointerId) return;
      cancel();
      commit(next ?? current.value);
    },
    // Cancel only the draft owned by the ending pointer.
    cancel: (event: PointerEvent<HTMLElement>) => {
      if (held.current?.pointerId === event.pointerId) cancel();
    },
  };
}
