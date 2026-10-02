import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

const PREFIX = 'tots:v1:';

// useState that survives a page reload via localStorage. `revive` cleans up a stored value
// (e.g. drops in-flight flags) and may return undefined to fall back to `initial`. Storage can be
// unavailable or full (private windows, blocked site data); the app then just behaves as before.
export function usePersistentState<T>(
  key: string, initial: T, revive?: (stored: unknown) => T | undefined,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return revive ? revive(parsed) ?? initial : (parsed as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* quota or blocked storage: keep working in memory */ }
  }, [key, value]);

  return [value, setValue];
}
