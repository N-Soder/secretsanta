// Home uses this same key for its JSON-encoded continuation token (Task 20).
export const CONTINUATION_KEY = 'secretSantaManageToken';
export function clearGroupContinuation(token: string) {
  try {
    const saved = localStorage.getItem(CONTINUATION_KEY);
    if (saved !== null && JSON.parse(saved) === token) localStorage.removeItem(CONTINUATION_KEY);
  } catch { /* Storage may be blocked. Group deletion still succeeded. */ }
}
