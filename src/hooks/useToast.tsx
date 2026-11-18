import React, {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import contextHook from './contextHook';

type ToastLevel = 'success' | 'info' | 'warning' | 'error';
type ToastMessage = {
  id: number;
  text: string;
  level: ToastLevel;
  icon?: ReactNode;
  duration: number;
};
type ToastInput = {
  text: string;
  icon?: ReactNode;
  level?: ToastLevel;
  duration?: number;
};
type ToastContextValue = {
  messages: ToastMessage[];
  postMessage: (input: ToastInput) => number;
  dismissMessage: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function MessageTimer({
  message,
  dismissMessage,
}: {
  message: ToastMessage;
  dismissMessage: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(
      () => dismissMessage(message.id),
      message.duration
    );
    return () => clearTimeout(timer);
  }, [dismissMessage, message.id, message.duration]);

  return null;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const postMessage = useCallback(
    ({ text, level = 'info', icon, duration = 3000 }: ToastInput) => {
      if (!['success', 'info', 'warning', 'error'].includes(level)) {
        throw new Error('Invalid toast level');
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error('Invalid toast duration');
      }
      const message = { text, level, icon, duration, id: nextId.current };
      nextId.current += 1;
      setMessages((prev) => [...prev, message]);
      return message.id;
    },
    []
  );

  const dismissMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ messages, postMessage, dismissMessage }),
    [messages, postMessage, dismissMessage]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {messages.map((message) => (
        <MessageTimer
          key={message.id}
          message={message}
          dismissMessage={dismissMessage}
        />
      ))}
    </ToastContext.Provider>
  );
}

const hookFactory = contextHook(
  ToastContext,
  'useToast must be used within a ToastProvider'
);

export const usePostMessage = hookFactory('postMessage');
export const useToastMessages = hookFactory('messages');
export const useDismissMessage = hookFactory('dismissMessage');
