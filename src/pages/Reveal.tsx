import { useEffect, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { api, ApiClientError } from '../api/client';
import type { RevealView } from '../api/types';
import { LIMITS } from '../api/limits';
import { Layout } from '../components/Layout';
import { formatBudget, formatEventDate } from '../utils/format';
import { initialRevealState, revealReducer } from '../utils/revealState';

const DEMO: RevealView = {
  giverName: 'Simba', receiver: { name: 'Nala', hint: 'Loves a good book', wishlist: 'A novel and some tea, please.' },
  ownWishlist: '', message: 'Bring your wrapped gift to our festive dinner.', budgetAmount: 3000,
  budgetCurrency: 'AUD', eventDate: '2026-12-20', expiresAt: '2027-01-19T00:00:00Z',
};
export function Reveal() {
  const { code = '' } = useParams();
  // A new token gets a separate lifetime: old reads and saves cannot update it.
  return <RevealContent key={code} code={code}/>;
}
function RevealContent({ code }: { code: string }) {
  const { t } = useTranslation();
  const demo = code === 'demo';
  const [state, dispatch] = useReducer(revealReducer, demo ? { ...initialRevealState, view: DEMO } : initialRevealState);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const alive = useRef(true);
  const saving = useRef(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController>();
  const heading = useRef<HTMLHeadingElement>(null);

  const refresh = async () => {
    if (demo || saving.current) return;
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    try {
      const view = await api.reveal(code, abort.signal);
      if (!alive.current || id !== requestId.current) return;
      dispatch({ type: 'received', view }); setError(''); setEnded(false);
    } catch (cause) {
      if (!alive.current || id !== requestId.current || abort.signal.aborted) return;
      if (cause instanceof ApiClientError && cause.status === 404) setEnded(true);
      else setError('Couldn’t load your match. Try again.');
    } finally { if (alive.current && id === requestId.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false; ++requestId.current; controller.current?.abort();
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible);
    };
  }, [code]);
  useEffect(() => { if (state.view) heading.current?.focus({ preventScroll: true }); }, [!!state.view]);
  const save = async () => {
    if (saving.current || ended) return;
    saving.current = true; ++requestId.current; controller.current?.abort();
    setPending(true); dispatch({ type: 'saving' });
    const submitted = state.draft;
    try {
      const result = demo ? { wishlist: submitted } : await api.wishlist(code, submitted);
      if (alive.current) dispatch({ type: 'saved', submitted, saved: result?.wishlist ?? submitted });
    } catch (cause) {
      if (alive.current) {
        dispatch({ type: 'failed' });
        if (cause instanceof ApiClientError && cause.status === 404) setEnded(true);
      }
    } finally { saving.current = false; if (alive.current) setPending(false); }
  };
  const view = state.view;
  return <Layout headerLink={{ to: '/', label: t('pairing.startYourOwn') }}>
    <div className="mx-auto max-w-[460px] py-8 sm:py-14">
      {demo && <p role="status" className="notice mb-5">This is an example. Wishlist changes stay here and are never sent or saved.</p>}
      {loading && <p role="status" className="notice">Loading your match…</p>}
      {ended && <div role="alert" className="notice">This link is no longer available. Ask your organiser for a current link.</div>}
      {error && <div role="alert" className="notice-error mb-5">{error} <button type="button" className="btn-quiet" onClick={() => void refresh()}>Retry</button></div>}
      {view && !ended && <>
        <div className="overflow-hidden rounded-card border border-line bg-paper pb-9 text-center shadow-card">
          <div className="fair-isle h-[22px]" aria-hidden/>
          <div className="px-6 pt-8 sm:px-8">
            <div className="mx-auto mb-5 h-3.5 w-3.5 rounded-full border-2 border-gold" aria-hidden/>
            <h1 ref={heading} tabIndex={-1} className="eyebrow focus:outline-none">{t('pairing.title')}</h1>
            <p className="mt-3.5 text-lede text-muted"><Trans i18nKey="pairing.assignment" components={{ name: <strong className="text-pine">{view.giverName}</strong> }}/></p>
            <div className="mt-4 break-words font-display text-[clamp(3.4rem,12vw,5.25rem)] leading-none text-pine">{view.receiver.name}</div>
            <div className="mx-auto my-6 h-0.5 w-[60px] rounded bg-cranberry" aria-hidden/>
          </div>
          <div className="mx-6 space-y-4 text-left text-ui sm:mx-7">
            {(view.budgetAmount !== null || view.eventDate) && <dl className="rounded-xl bg-ivory p-4 text-pine">
              {view.budgetAmount !== null && <div><dt className="font-bold">Budget</dt><dd>{formatBudget(view.budgetAmount, view.budgetCurrency)}</dd></div>}
              {view.eventDate && <div className="mt-2"><dt className="font-bold">Event date</dt><dd>{formatEventDate(view.eventDate)}</dd></div>}
            </dl>}
            {view.receiver.hint && <p className="whitespace-pre-wrap break-words">{view.receiver.hint}</p>}
            {view.message && <p className="whitespace-pre-wrap break-words">{view.message}</p>}
            <section className="rounded-xl bg-ivory p-4"><h2 className="text-heading text-pine">{view.receiver.name}’s wishlist</h2><p className="mt-2 whitespace-pre-wrap break-words text-body">{view.receiver.wishlist || 'No wishlist yet. Check back later.'}</p></section>
          </div>
        </div>
        <section className="mt-6 rounded-card border border-line bg-paper p-5 shadow-card">
          <h2 className="text-heading text-pine"><label htmlFor="own-wishlist">Your wishlist</label></h2>
          <p id="wishlist-help" className="mt-2 text-caption text-muted">Only the person buying for you can see this. Maximum {LIMITS.wishlist} characters.</p>
          <textarea id="own-wishlist" aria-describedby="wishlist-help" maxLength={LIMITS.wishlist} className="field mt-3 min-h-28" value={state.draft} onChange={e => dispatch({ type: 'edited', text: e.target.value })}/>
          <p role="status" className="mt-2 text-caption text-muted">{state.status}</p>
          <button type="button" disabled={pending} className="btn-primary mt-4 disabled:opacity-50" onClick={() => void save()}>{pending ? 'Saving…' : 'Save wishlist'}</button>
        </section>
      </>}
    </div>
  </Layout>;
}
