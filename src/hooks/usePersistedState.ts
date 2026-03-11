import { useState, useCallback, Dispatch, SetStateAction } from 'react';

export function usePersistedState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch {}
    return defaultValue;
  });

  const setPersisted = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setValue((prev) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [key]);

  return [value, setPersisted];
}
