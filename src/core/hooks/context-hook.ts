import { useContext, type Context } from 'react';

// Create typed hook accessors for a context's individual values.
export default function contextHook<T>(
  context: Context<T | null>,
  error: string
) {
  return function hookFactory<K extends keyof T>(key: K): () => T[K] {
    // Create a hook that reads one selected context value.
    return function useValue(): T[K] {
      const value = useContext(context);
      if (!value) throw new Error(error);
      return value[key];
    };
  };
}
