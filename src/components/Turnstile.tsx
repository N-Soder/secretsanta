import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { loadTurnstile, type TurnstileApi } from '../utils/turnstile';

export interface TurnstileHandle {
  // Take the current token once and always reset after the request settles.
  run<T>(request: (token: string) => Promise<T>): Promise<T>;
  reset(): void;
}
interface Props { siteKey: string; onTokenChange?: (token: string | null) => void; }
type Status = 'loading' | 'checking' | 'ready' | 'expired' | 'error';
const messages: Record<Status, string> = {
  loading: 'Loading verification…', checking: 'Complete the verification below.',
  ready: 'Verification complete.', expired: 'Verification expired. Please retry.',
  error: 'Verification could not be completed. Please retry.',
};

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile({ siteKey, onTokenChange }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string }>();
  const token = useRef<string | null>(null);
  const callback = useRef(onTokenChange); callback.current = onTokenChange;
  const mounted = useRef(false);
  const [status, setStatus] = useState<Status>('loading');
  const [generation, setGeneration] = useState(0);
  const statusId = useId();
  const clear = () => { token.current = null; callback.current?.(null); };
  const reset = () => {
    clear();
    if (!mounted.current) return;
    if (!widget.current) { setGeneration(value => value + 1); return; }
    setStatus('checking');
    try { widget.current.api.reset(widget.current.id); } catch { setStatus('error'); }
  };
  useImperativeHandle(ref, () => ({
    reset,
    async run(request) {
      const current = token.current;
      const currentWidget = widget.current;
      if (!current) throw new Error('Complete verification before submitting.');
      clear();
      if (mounted.current) setStatus('checking');
      try { return await request(current); } finally { if (widget.current === currentWidget) reset(); }
    },
  }));
  useEffect(() => {
    mounted.current = true;
    let active = true;
    clear(); setStatus('loading');
    const fail = (next: Status) => { if (active) { clear(); setStatus(next); } };
    if (!siteKey) fail('error');
    else void loadTurnstile().then(api => {
      if (!active || !container.current) return;
      setStatus('checking');
      const id = api.render(container.current, {
        sitekey: siteKey, 'response-field': false, 'refresh-expired': 'manual', retry: 'never',
        callback: value => { if (active) { token.current = value; callback.current?.(value); setStatus('ready'); } },
        'expired-callback': () => fail('expired'), 'error-callback': () => fail('error'),
        'timeout-callback': () => fail('error'), 'unsupported-callback': () => fail('error'),
      });
      if (id === undefined) fail('error');
      else widget.current = { api, id };
    }).catch(() => fail('error'));
    return () => {
      active = false; mounted.current = false; clear();
      if (widget.current) { widget.current.api.remove(widget.current.id); widget.current = undefined; }
    };
  }, [siteKey, generation]);
  return (
    <div className="space-y-2" role="group" aria-label="Bot verification" aria-describedby={statusId}>
      <div ref={container} />
      <p id={statusId} role="status" aria-live="polite" className="text-[13px] text-muted">{messages[status]}</p>
      {(status === 'error' || status === 'expired') && (
        <button type="button" className="btn-secondary" onClick={reset}>Retry verification</button>
      )}
    </div>
  );
});
