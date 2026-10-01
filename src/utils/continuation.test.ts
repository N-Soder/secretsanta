import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGroupContinuation, CONTINUATION_KEY } from './continuation';

afterEach(() => vi.unstubAllGlobals());
describe('clearGroupContinuation', () => {
  it('clears only a continuation for the deleted group', () => {
    const entries = new Map([[CONTINUATION_KEY, JSON.stringify('this-group')], ['secretSantaImportedSettings', '{"message":"Next year"}']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, removeItem: (key: string) => entries.delete(key) });
    clearGroupContinuation('other-group');
    expect(entries.has(CONTINUATION_KEY)).toBe(true);
    clearGroupContinuation('this-group');
    expect(entries.has(CONTINUATION_KEY)).toBe(false);
    expect(entries.has('secretSantaImportedSettings')).toBe(true);
  });
  it('preserves malformed storage rather than deleting unrelated data', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => 'invalid json', removeItem });
    expect(() => clearGroupContinuation('this-group')).not.toThrow();
    expect(removeItem).not.toHaveBeenCalled();
  });
  it('does not turn a successful server deletion into failure when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage blocked'); } });
    expect(() => clearGroupContinuation('this-group')).not.toThrow();
  });
});
