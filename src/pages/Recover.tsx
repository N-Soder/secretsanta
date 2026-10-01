import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { EMAIL_PATTERN, LIMITS } from '../api/limits';
import { Layout } from '../components/Layout';
import { Turnstile, type TurnstileHandle } from '../components/Turnstile';
import { useConfig } from '../hooks/useConfig';

// Every accepted request shows the same text, so the page never reveals
// whether an address belongs to a group.
function failureMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.apiError.error === 'turnstile') return 'The verification didn’t go through. Please complete it again and retry.';
    if (error.apiError.error === 'invalid') return 'Please enter a valid email address.';
    if (error.apiError.error === 'emailDisabled') return 'Email isn’t set up on this site, so links can’t be recovered right now.';
    if (error.status === 0) return 'We couldn’t reach the server. Check your connection and try again.';
  }
  if (error instanceof Error && error.message.startsWith('Complete verification')) return 'Please complete the verification first.';
  return 'Something went wrong. Please try again in a moment.';
}

export function Recover() {
  const config = useConfig();
  const verification = useRef<TurnstileHandle>(null);
  const submitting = useRef(false);
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const valid = email.trim().length <= LIMITS.email && EMAIL_PATTERN.test(email.trim());
  const emailEnabled = config.status === 'ready' && config.config.emailEnabled;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || !verification.current || !valid) return;
    submitting.current = true; setPending(true); setError('');
    try {
      await verification.current.run(token => api.recover(email.trim(), token));
      setDone(true);
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      submitting.current = false; setPending(false);
    }
  };

  return (
    <Layout>
      <section className="mx-auto max-w-xl py-10">
        <p className="eyebrow">Organiser link</p>
        <h1 className="mt-2 text-display text-pine">Recover your link</h1>
        {done ? <>
          <div role="status" className="notice mt-6">
            If that address belongs to a group, we’ve emailed a new organiser link to it. It can take a few minutes to arrive. Once it’s sent, older organiser links for that group stop working.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={() => { setDone(false); setEmail(''); }}>Try another address</button>
            <Link className="btn-quiet" to="/">Back to the start</Link>
          </div>
        </> : <>
          <p className="mt-4 leading-relaxed text-muted">
            Enter the email address you gave when you set up the draw. We’ll send a new organiser link for each group that uses it.
          </p>
          {config.status === 'loading' && <p role="status" className="mt-6 text-caption text-muted">Loading…</p>}
          {config.status === 'error' && <div role="alert" className="notice-error mt-6">
            We couldn’t load this page’s settings. <button type="button" className="underline" onClick={() => void config.retry()}>Try again</button>
          </div>}
          {config.status === 'ready' && !emailEnabled && <div role="status" className="notice mt-6">
            Email isn’t set up on this site, so links can’t be recovered here. If you still have the organiser link, open it directly.
          </div>}
          {emailEnabled && <form className="mt-6 space-y-5" onSubmit={event => void submit(event)} noValidate>
            <fieldset disabled={pending} className="min-w-0 space-y-5">
              <div>
                <label htmlFor="recover-email" className="mb-2 block text-ui font-bold text-pine">Your email</label>
                <input id="recover-email" className="field" type="email" autoComplete="email" required maxLength={LIMITS.email}
                  value={email} onChange={event => setEmail(event.target.value)} aria-describedby="recover-email-help"/>
                <p id="recover-email-help" className="mt-1 text-caption text-muted">
                  Used only to find your group and send the link. <Link className="underline" to="/privacy" target="_blank" rel="noopener">Privacy</Link>
                </p>
              </div>
              <Turnstile ref={verification} siteKey={config.config.turnstileSiteKey} onTokenChange={token => setVerified(!!token)}/>
            </fieldset>
            {error && <div role="alert" className="notice-error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={pending || !verified || !valid}>
              {pending ? 'Sending…' : 'Email me a new link'}
            </button>
          </form>}
        </>}
      </section>
    </Layout>
  );
}
