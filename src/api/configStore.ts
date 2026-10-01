import { api } from './client';
import type { ConfigResponse } from './types';

export type ConfigState = { status: 'loading' } | { status: 'ready'; config: ConfigResponse } | { status: 'error'; error: Error };
let state: ConfigState = { status: 'loading' };
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
export const getConfigSnapshot = () => state;
export function subscribeConfig(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: ConfigState) { state = next; listeners.forEach(listener => listener()); }
export function loadConfig(retry = false): Promise<void> {
  if (pending) return pending;
  if (state.status !== 'loading' && !retry) return Promise.resolve();
  if (retry) publish({ status: 'loading' });
  pending = api.config().then(config => publish({ status: 'ready', config }), error => {
    publish({ status: 'error', error: error instanceof Error ? error : new Error('Configuration could not be loaded.') });
  }).finally(() => { pending = undefined; });
  return pending;
}
