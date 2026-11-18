import { useContext, type Context } from 'react';

export default function contextHook<T>(
  context: Context<T | null>,
  error: string
) {
  return function hookFactory<K extends keyof T>(key: K): () => T[K] {
    return function useValue(): T[K] {
      const value = useContext(context);
      if (!value) throw new Error(error);
      return value[key];
    };
  };
}
