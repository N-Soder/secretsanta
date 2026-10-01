import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import type { ManageParticipant, ManageView, SendKind, SendResponse } from '../../api/types';
import { api } from '../../api/client';
import { Turnstile, type TurnstileHandle } from '../Turnstile';
import { CopyButton } from '../CopyButton';
import { formatSentAt } from '../../utils/format';

export function LinksList({ view, token, siteKey, onSent, offerMatchUpdate = false }: { offerMatchUpdate?: boolean; view: ManageView; token: string; siteKey: string; onSent: () => Promise<void> }) {
  const { t } = useTranslation();
  const verifier = useRef<TurnstileHandle>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const [failedKind, setFailedKind] = useState<SendKind>('link');
  const eligible = view.participants.filter(p => p.email && !p.sent.link).length;
  // Sent stamps cover only the current draw, so after any redraw the match
  // update stays available (also after a reload) until each person has had one.
  const redrawn = view.drawVersion > 1;
  const matchPending = redrawn ? view.participants.filter(p => p.email && !p.sent.match_changed).length : 0;
  const send = async (kind: SendKind, participantIds?: string[]) => {
    if (busy || !siteKey || !verifier.current) return;
    setBusy(true); setMessage('');
    try {
      const result = await verifier.current.run(value => api.send(token, { kind, ...(participantIds ? { participantIds } : {}), turnstileToken: value }));
      const bad = result.results.filter(item => !item.ok).map(item => item.participantId);
      setFailed(bad); setFailedKind(kind); setMessage(bad.length ? `${bad.length} email${bad.length === 1 ? '' : 's'} couldn’t be sent. Retry the failed people below.` : 'Email sent.');
      await onSent();
    } catch { setMessage('Email couldn’t be sent. Please try again.'); }
    finally { setBusy(false); }
  };
  const personById = new Map(view.participants.map(person => [person.id, person]));
  return <section className="mt-8 rounded-card border border-line bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl text-pine">Participant links</h2><p className="mt-2 text-caption text-muted">Share each person’s link privately. Organiser view never shows matches or wishlists.</p></div>{view.emailEnabled && <button className="btn-secondary" disabled={busy || !siteKey || eligible === 0} onClick={() => void send('link')}>Email {eligible} {eligible === 1 ? 'link' : 'links'}</button>}</div>
    {(offerMatchUpdate || (view.emailEnabled && matchPending > 0)) && <div className="notice mt-4"><p role="status">{offerMatchUpdate ? t('manage.redrawSucceeded') : t('manage.matchUpdatePending', { count: matchPending })}</p>{view.emailEnabled && <button className="btn-secondary mt-3" disabled={busy || !siteKey || matchPending === 0} onClick={() => void send('match_changed')}>{t('manage.emailMatchesChanged')}</button>}</div>}
    <ul className="mt-5 divide-y divide-line">
      {view.participants.map(person => <li key={person.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0"><p className="font-bold text-pine">{person.name}</p>{view.emailEnabled && <p className="mt-1 break-all text-caption text-muted">{person.email || 'No email address'}</p>}<div className="mt-2 flex flex-wrap gap-2">{person.opened ? <span className="chip">Opened</span> : <span className="rounded-full bg-ivory px-2 py-0.5 text-micro text-muted">Not opened</span>}{person.sent.link && <span className="rounded-full bg-ivory px-2 py-0.5 text-micro text-muted">Link sent {formatSentAt(person.sent.link)}</span>}{person.sent.match_changed && <span className="rounded-full bg-ivory px-2 py-0.5 text-micro text-muted">Match update sent {formatSentAt(person.sent.match_changed)}</span>}</div></div>
        <div className="flex flex-wrap gap-2"><CopyButton className="btn-secondary" textToCopy={person.link}>Copy link</CopyButton>{view.emailEnabled && person.email && <button className="btn-quiet" disabled={busy || !siteKey} onClick={() => void send('link', [person.id])}>Resend</button>}{view.emailEnabled && person.email && redrawn && <button className="btn-quiet" disabled={busy || !siteKey} onClick={() => void send('match_changed', [person.id])}>Send match update</button>}</div>
      </li>)}
    </ul>
    {view.emailEnabled && <div className="mt-4 border-t border-line pt-4">{siteKey ? <Turnstile ref={verifier} siteKey={siteKey}/> : <p role="status" className="text-caption text-muted">Loading verification settings…</p>}{message && <p role="status" className="mt-2 text-caption text-muted">{message}</p>}{failed.length > 0 && <ul className="mt-2 space-y-1">{failed.map(id => { const person: ManageParticipant | undefined = personById.get(id); return person && <li key={id} className="flex items-center justify-between gap-3 text-caption"><span>{person.name}</span><button className="underline" disabled={busy || !siteKey} onClick={() => void send(failedKind, [id])}>Retry</button></li>; })}</ul>}</div>}
  </section>;
}
