import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { ManageView, ParticipantInput } from '../api/types';
import { Layout } from '../components/Layout';
import { GroupDetails } from '../components/manage/GroupDetails';
import { LinksList } from '../components/manage/LinksList';
import { PeopleAndRules, inputPeople } from '../components/manage/PeopleAndRules';
import { DeleteGroup } from '../components/manage/DeleteGroup';
import { peopleDiff } from '../utils/peopleDiff';
import { clearGroupContinuation } from '../utils/continuation';
import { Exports } from '../components/manage/Exports';
import { useConfig } from '../hooks/useConfig';
import { formatExpiry } from '../utils/format';

export function Manage() {
  const { code = '' } = useParams();
  const activeCode = useRef(code);
  activeCode.current = code;
  const [view, setView] = useState<ManageView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const configState = useConfig();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutationBusy = useRef(false);
  const [redrawn, setRedrawn] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const readEpoch = useRef(0);
  const latestView = useRef<ManageView | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const epoch = readEpoch.current;
    try {
      const next = await api.manage(code, signal);
      if (!signal?.aborted && epoch === readEpoch.current) {
        setView(previous => {
          if (previous && previous.revision > next.revision) return previous;
          latestView.current = next;
          return next;
        });
        setState('ready');
        return next;
      }
    } catch (error) {
      if (signal?.aborted || epoch !== readEpoch.current) return;
      if (latestView.current && !(error instanceof ApiClientError && error.status === 404)) return;
      setState(error instanceof ApiClientError && error.status === 404 ? 'missing' : 'error');
    }
  }, [code]);
  const save = useCallback((patch: import('../api/types').PatchRequest) => {
    const operation = saveQueue.current.then(async () => {
      if (activeCode.current !== code) throw new Error('The organiser link changed.');
      const current = latestView.current;
      if (!current) throw new Error('Group is not loaded.');
      const next = await api.patch(code, { ...patch, revision: current.revision });
      if (activeCode.current !== code) return;
      readEpoch.current++;
      latestView.current = next;
      setView(previous => previous && next.revision >= previous.revision ? next : previous);
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }, [code]);

  const reloadDraft = async () => {
    const next = await api.manage(code);
    if (activeCode.current !== code) throw new Error('The organiser link changed.');
    readEpoch.current++;
    latestView.current = next;
    setView(next);
    return next;
  };
  const apply = async (base: ManageView, participants: ParticipantInput[], confirmedCount: number | null) => {
    if (mutationBusy.current) throw new Error('An operation is already pending.');
    mutationBusy.current = true; setBusy(true);
    try {
      await saveQueue.current;
      if (activeCode.current !== code) throw new Error('The organiser link changed.');
      const current = await api.manage(code);
      if (current.revision !== base.revision || current.drawVersion !== base.drawVersion) throw new ApiClientError(409, { error: 'stale' });
      const diff = peopleDiff(inputPeople(base), participants);
      const count = current.participants.filter(person => person.opened).length;
      if (diff.requiresRedraw && count > (confirmedCount ?? 0)) throw new ApiClientError(409, { error: 'needsConfirm', viewedCount: count });
      const next = diff.requiresRedraw
        ? await api.redraw(code, { drawVersion: base.drawVersion, participants, confirm: confirmedCount !== null })
        : await api.patch(code, { revision: base.revision, participants: diff.patches });
      if (activeCode.current !== code) throw new Error('The organiser link changed.');
      readEpoch.current++; latestView.current = next; setView(next);
      if (diff.requiresRedraw) setRedrawn(true);
      return next;
    } finally { mutationBusy.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setBusy(true);
    try {
      await saveQueue.current;
      if (activeCode.current !== code) throw new Error('The organiser link changed.');
      await api.delete(code);
      clearGroupContinuation(code);
      if (activeCode.current !== code) return;
      readEpoch.current++; latestView.current = null; setView(null); setState('missing');
    } finally { mutationBusy.current = false; setBusy(false); }
  };

  useEffect(() => {
    const controller = new AbortController();
    readEpoch.current++; latestView.current = null; setView(null); setState('loading'); setEditing(false); setRedrawn(false);
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
      <fieldset disabled={editing || busy} className="min-w-0"><GroupDetails key={code} view={view} save={save} emailEnabled={view.emailEnabled}/></fieldset>
      <PeopleAndRules key={code} view={view} apply={apply} reload={reloadDraft} onEditing={setEditing} busy={busy}/>
      <fieldset disabled={busy} className="min-w-0"><LinksList key={`${code}-${view.drawVersion}`} offerMatchUpdate={redrawn} view={view} token={code} siteKey={configState.status === 'ready' ? configState.config.turnstileSiteKey : ''} onSent={async () => { await refresh(); }}/></fieldset>
      <Exports token={code}/>
      <DeleteGroup remove={remove} busy={busy} disabled={editing}/>
    </div>}
  </Layout>;
}
