import { useCallback, useMemo, useState } from 'react';
import logger from '../../utils/logger';

export const HELP_PREFERENCE_KEY = 'web-control-plus:hide-help';

type Preference = {
  hidden: boolean;
  error: string | null;
};

// Read and update the user's persisted help visibility preference.
export default function useHelpPreference() {
  const [preference, setPreference] = useState<Preference>(() => {
    try {
      const saved = window.localStorage.getItem(HELP_PREFERENCE_KEY);
      if (saved !== null && saved !== 'true' && saved !== 'false') {
        throw new Error('Invalid saved help preference');
      }
      return { hidden: saved === 'true', error: null };
    } catch (cause) {
      logger.error('Cannot read help preference', cause);
      return {
        hidden: false,
        error:
          'Cannot read the help preference. Help is shown for this session.',
      };
    }
  });
  // Persist the preference and expose storage errors to the UI.
  const remember = useCallback((hidden: boolean) => {
    try {
      window.localStorage.setItem(HELP_PREFERENCE_KEY, String(hidden));
      setPreference({ hidden, error: null });
    } catch (cause) {
      logger.error('Cannot save help preference', cause);
      setPreference((previous) => ({
        ...previous,
        error:
          'Cannot save the help preference. ' +
          'Dismiss still works for this session.',
      }));
    }
  }, []);
  return useMemo(() => ({ ...preference, remember }), [preference, remember]);
}
