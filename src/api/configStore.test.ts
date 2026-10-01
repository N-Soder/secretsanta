import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.restoreAllMocks(); });
it('shares one config load, preserves explicit failure, and offers a retry', async () => {
  vi.resetModules(); const { loadConfig, getConfigSnapshot, subscribeConfig } = await import('./configStore');
  const { api: freshApi } = await import('./client');
  const config = { emailEnabled: false, turnstileSiteKey: 'test' };
  const fetch = vi.spyOn(freshApi, 'config').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(config);
  const listener = vi.fn(); const unsubscribe = subscribeConfig(listener);
  expect(getConfigSnapshot()).toEqual({ status: 'loading' });
  await Promise.all([loadConfig(), loadConfig()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getConfigSnapshot()).toMatchObject({ status: 'error' });
  await loadConfig(); expect(fetch).toHaveBeenCalledTimes(1);
  await loadConfig(true);
  expect(getConfigSnapshot()).toEqual({ status: 'ready', config });
  await loadConfig(); expect(fetch).toHaveBeenCalledTimes(2);
  unsubscribe(); expect(listener).toHaveBeenCalledTimes(3);
});
