// Vite-only verification fixture; this is not an application route/build entry.
// ?fake exercises lifecycle deterministically. Default uses the official test key.
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Turnstile, type TurnstileHandle } from '../../src/components/Turnstile';
import type { TurnstileOptions } from '../../src/utils/turnstile';

const fake = new URLSearchParams(location.search).has('fake');
let current: TurnstileOptions | undefined;
const stats = { renders: 0, removes: 0, resets: 0, requests: 0 };
if (fake) window.turnstile = {
  ready: callback => callback(),
  render: (container, options) => {
    current = options; stats.renders++;
    container.innerHTML = '<span>Local fake challenge</span>';
    return String(stats.renders);
  },
  remove: () => { stats.removes++; },
  reset: () => { stats.resets++; },
};
const handle = React.createRef<TurnstileHandle>();
let toggle: () => void;
let tokenReady = false;
function Fixture() {
  const [show, setShow] = useState(true);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState('No request yet.');
  toggle = () => flushSync(() => setShow(value => !value));
  return <main style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem', fontFamily: 'sans-serif' }}>
    <h1>Local Turnstile verification</h1>
    <p>{fake ? 'Deterministic fake provider.' : 'Official Cloudflare test site key.'} No API mutations or email.</p>
    {show && <Turnstile ref={handle} siteKey="1x00000000000000000000AA" onTokenChange={value => { tokenReady = Boolean(value); setReady(Boolean(value)); }} />}
    <p>Token: {ready ? 'ready' : 'unavailable'}</p>
    <button onClick={toggle}>Toggle widget</button>{' '}
    <button disabled={!ready} onClick={() => {
      void handle.current!.run(async () => { stats.requests++; return 'Request completed.'; }).then(setResult);
    }}>Run local request</button>
    <p role="status">{result}</p>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><Fixture /></StrictMode>);
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function runChecks() {
  if (!fake) throw new Error('Fake mode required');
  const assert = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
  await tick();
  assert(stats.renders - stats.removes === 1, 'one active widget after StrictMode mount');
  current!.callback('local-token'); await tick(); assert(tokenReady, 'success publishes readiness');
  current!['expired-callback'](); await tick(); assert(!tokenReady, 'expiry clears token');
  assert(document.body.textContent!.includes('Verification expired'), 'expiry status is labelled');
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry verification')!;
  retry.click(); await tick(); assert(stats.resets === 1, 'retry resets widget');
  current!.callback('local-token');
  let finish!: () => void;
  const request = handle.current!.run(() => new Promise<void>(resolve => { stats.requests++; finish = resolve; }));
  assert(!tokenReady, 'request consumes token immediately');
  await handle.current!.run(async () => { throw new Error('must not run'); }).then(() => { throw new Error('token reused'); }, error => assert(error.message.includes('Complete verification'), 'second request requires fresh token'));
  finish(); await request; assert(stats.resets === 2, 'successful request resets widget');
  current!.callback('local-token');
  await handle.current!.run(async () => { throw new Error('simulated request failure'); }).catch(() => {});
  assert(stats.resets === 3 && !tokenReady, 'failed request resets widget');
  current!['error-callback'](); await tick(); assert(!tokenReady, 'error clears token');
  const old = current!; toggle(); await tick();
  old.callback('late-token'); assert(!tokenReady, 'unmounted callback is ignored');
  assert(stats.renders === stats.removes, 'unmount removes active widget');
  toggle(); await tick(); assert(stats.renders - stats.removes === 1, 'remount creates only one widget');
  assert(document.querySelectorAll('script[src*="challenges.cloudflare.com"]').length === 0, 'fake test performs no provider script fetch');
  return { passed: true, ...stats };
}
Object.assign(window, { runTurnstileChecks: runChecks });
