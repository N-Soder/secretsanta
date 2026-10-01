import { useEffect, useSyncExternalStore } from 'react';
import { getConfigSnapshot, loadConfig, subscribeConfig } from '../api/configStore';

// Only public configuration is shared in memory. No group/reveal data is cached
// or persisted. Consumers must render a retry action for the error state.
export function useConfig() {
  const state = useSyncExternalStore(subscribeConfig, getConfigSnapshot, getConfigSnapshot);
  useEffect(() => { void loadConfig(); }, []);
  return { ...state, retry: () => loadConfig(true) };
}
