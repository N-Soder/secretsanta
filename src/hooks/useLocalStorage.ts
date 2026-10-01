import { useEffect } from "react";

import { useState } from "react";

export const useLocalStorage = <T,>(key: string, initialValue: T, migrate: (value: any) => T = (value: any) => value, serialise: (value: T) => T = value => value) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? migrate(JSON.parse(stored)) : initialValue;
    } catch { return initialValue; }
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(serialise(value))); } catch { /* Keep the in-memory draft when storage is blocked. */ }
  }, [key, value]);

  return [value, setValue] as const;
};

