export interface TurnstileOptions {
  sitekey: string;
  callback(token: string): void;
  'expired-callback'(): void;
  'error-callback'(): void;
  'timeout-callback'(): void;
  'unsupported-callback'(): void;
  'response-field': boolean;
  'refresh-expired': 'manual';
  retry: 'never';
  appearance?: 'always' | 'interaction-only';
  'before-interactive-callback'?(): void;
  'after-interactive-callback'?(): void;
}
export interface TurnstileApi {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
let pending: Promise<TurnstileApi> | undefined;
export function loadTurnstile(): Promise<TurnstileApi> {
  if (pending) return pending;
  if (window.turnstile) return Promise.resolve(window.turnstile);
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timeout); script.remove();
      reject(new Error('Verification could not be loaded. Please retry.'));
    };
    const timeout = setTimeout(fail, 15_000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=secretSantaTurnstileLoaded';
    script.async = true;
    script.onerror = fail;
    window.secretSantaTurnstileLoaded = () => {
      if (!window.turnstile) { fail(); return; }
      const api = window.turnstile;
      clearTimeout(timeout); resolve(api);
    };
    document.head.appendChild(script);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
