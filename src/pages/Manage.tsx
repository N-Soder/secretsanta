import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { ManageView } from '../api/types';
import { Layout } from '../components/Layout';
import { GroupDetails } from '../components/manage/GroupDetails';
import { LinksList } from '../components/manage/LinksList';
import { Exports } from '../components/manage/Exports';
import { useConfig } from '../hooks/useConfig';
import { formatExpiry } from '../utils/format';

export function Manage() {
  const { code = '' } = useParams();
  const [view, setView] = useState<ManageView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const configState = useConfig();
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestView = useRef<ManageView | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await api.manage(code, signal);
      if (!signal?.aborted) {
        setView(previous => {
          if (previous && previous.revision > next.revision) return previous;
          latestView.current = next;
          return next;
        });
        setState('ready');
      }
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof ApiClientError && error.status === 404 ? 'missing' : 'error');
    }
  }, [code]);
  const save = useCallback((patch: import('../api/types').PatchRequest) => {
    const operation = saveQueue.current.then(async () => {
      const current = latestView.current;
      if (!current) throw new Error('Group is not loaded.');
      const next = await api.patch(code, { ...patch, revision: current.revision });
      latestView.current = next;
      setView(previous => previous && next.revision >= previous.revision ? next : previous);
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }, [code]);

  useEffect(() => {
    const controller = new AbortController();
    latestView.current = null; setView(null); setState('loading');
    void refresh(controller.signal);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { controller.abort(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);

  return <Layout headerLink={{ to: '/', label: 'Start a new draw' }}>
    {state === 'loading' && <div className="mx-auto max-w-3xl py-12" role="status" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded bg-gold-soft"/><p className="mt-4 text-muted">Loading your group…</p></div>}
    {state === 'missing' && <section className="mx-auto max-w-2xl py-10"><p className="eyebrow">Organiser link</p><h1 className="mt-2 text-4xl text-pine">This group has ended or the link is wrong</h1><p className="mt-4 leading-relaxed text-muted">If you still need access, you can request a new organiser link.</p><div className="mt-6 flex flex-wrap gap-3"><Link className="btn-secondary" to="/recover">Recover your link</Link><Link className="btn-quiet" to="/">Start a new draw</Link></div></section>}
    {state === 'error' && <section className="mx-auto max-w-2xl py-10" role="alert"><h1 className="text-4xl text-pine">We couldn’t load this group</h1><p className="mt-3 text-muted">Check your connection and try again.</p><button className="btn-secondary mt-5" onClick={() => { setState('loading'); void refresh(); }}>Try again</button></section>}
    {state === 'ready' && view && <div className="mx-auto max-w-4xl pb-10">
      <p className="eyebrow">Organiser</p><h1 className="mt-2 text-4xl text-pine">Your Secret Santa</h1>
      <p className="mt-3 text-muted">This group will be deleted on {formatExpiry(view.expiresAt)}. Keep your organiser link somewhere safe.</p>
      {!view.emailEnabled && <p className="notice mt-4">Email delivery is currently unavailable. Links remain available to copy and download.</p>}
      {view.emailEnabled && configState.status === 'error' && <p className="notice mt-4" role="status">Verification settings could not be loaded. Email sending is unavailable until they load. <button className="underline" onClick={() => void configState.retry()}>Retry</button></p>}
      <GroupDetails view={view} save={save} emailEnabled={view.emailEnabled}/>
      <LinksList view={view} token={code} siteKey={configState.status === 'ready' ? configState.config.turnstileSiteKey : ''} onSent={() => refresh()}/>
      <Exports token={code}/>
    </div>}
  </Layout>;
}
