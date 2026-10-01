import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('shares script loading and retries after a failed load', async () => {
  vi.resetModules(); const scripts: { remove: ReturnType<typeof vi.fn>; onerror: () => void; onload: () => void }[] = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { createElement: () => ({ remove: vi.fn() }), head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) } });
  const { loadTurnstile } = await import('./turnstile');
  const first = loadTurnstile(); expect(loadTurnstile()).toBe(first); expect(scripts).toHaveLength(1);
  expect(typeof window.secretSantaTurnstileLoaded).toBe('function');
  scripts[0].onerror(); await expect(first).rejects.toThrow('Verification'); expect(scripts[0].remove).toHaveBeenCalled();
  const api = { ready: (callback: () => void) => callback(), render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
  const retry = loadTurnstile(); expect(scripts).toHaveLength(2);
  window.turnstile = api; window.secretSantaTurnstileLoaded!(); expect(await retry).toBe(api);
  expect(await loadTurnstile()).toBe(api); expect(scripts).toHaveLength(2);
});
it('fails a stalled script load so the UI can retry', async () => {
  vi.resetModules(); vi.useFakeTimers(); const remove = vi.fn();
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { createElement: () => ({ remove }), head: { appendChild: vi.fn() } });
  const { loadTurnstile } = await import('./turnstile');
  const pending = loadTurnstile(); const failure = expect(pending).rejects.toThrow('Verification');
  await vi.advanceTimersByTimeAsync(15_000); await failure; expect(remove).toHaveBeenCalled();
});
