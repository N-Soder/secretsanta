import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../../api/client';
import type { ManageView, ParticipantInput } from '../../api/types';
import type { Participant } from '../../types';
import { LIMITS, EMAIL_PATTERN } from '../../api/limits';
import { peopleDiff } from '../../utils/peopleDiff';
import { ParticipantsList } from '../ParticipantsList';
import { RulesModal } from '../RulesModal';
import { Modal } from '../Modal';
import { DrawBlockedNotice } from '../DrawBlockedNotice';

export const inputPeople = (view: ManageView): ParticipantInput[] => view.participants.map(({ id, name, hint, email, rules }) => ({ id, name, hint, email, rules: rules.map(rule => ({ ...rule })) }));
const asRecord = (view: ManageView): Record<string, Participant> => Object.fromEntries(inputPeople(view).map(person => [person.id, { ...person, email: person.email ?? undefined }]));
type Apply = (base: ManageView, people: ParticipantInput[], confirmedCount: number | null) => Promise<ManageView>;

export function PeopleAndRules({ view, apply, reload, onEditing, busy }: { view: ManageView; apply: Apply; reload: () => Promise<ManageView>; onEditing: (editing: boolean) => void; busy: boolean }) {
  const { t } = useTranslation();
  const applyButton = useRef<HTMLButtonElement>(null);
  const focusOnFinish = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const [base, setBase] = useState<ManageView | null>(null);
  const [draft, setDraft] = useState<Record<string, Participant>>({});
  const [rulePerson, setRulePerson] = useState<string | null>(null);
  const [warning, setWarning] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [reloading, setReloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const people: ParticipantInput[] = Object.values(draft).map(person => ({ ...person, name: person.name.trim(), hint: person.hint ?? '', email: person.email?.trim() || null }));
  const diff = peopleDiff(base ? inputPeople(base) : [], people);
  const historyCount = people.reduce((sum, person) => sum + person.rules.filter(rule => rule.origin === 'history').length, 0);
  useEffect(() => {
    if (!base && !busy && focusOnFinish.current) { focusOnFinish.current = false; opener.current?.focus(); }
  }, [base, busy]);
  const finish = () => { focusOnFinish.current = true; setBase(null); setWarning(null); setError(''); setStale(false); setBlocked(null); onEditing(false); };
  const change = (next: Record<string, Participant>) => { setDraft(next); setError(''); setBlocked(null); };
  const valid = () => {
    if (people.length < LIMITS.minParticipants || people.length > LIMITS.participants) { setError(t('manage.peopleCount', { min: LIMITS.minParticipants, max: LIMITS.participants })); return false; }
    if (diff.duplicateNames.length) { setError(t('manage.duplicateNames', { names: diff.duplicateNames.join(', ') })); return false; }
    if (people.some(person => !person.name || person.name.length > LIMITS.name || person.hint.length > LIMITS.hint || (person.email && (person.email.length > LIMITS.email || !EMAIL_PATTERN.test(person.email))) || person.rules.some(rule => !rule.targetParticipantId))) { setError(t('manage.invalidPeople')); return false; }
    return true;
  };
  const submit = async (confirmedCount: number | null = null) => {
    if (!base || busy || stale || !valid()) return;
    setError(''); setBlocked(null);
    try {
      await apply(base, people, confirmedCount);
      setSaved(true); finish();
    } catch (failure) {
      setWarning(null);
      if (failure instanceof ApiClientError) {
        if (failure.apiError.error === 'needsConfirm') { setWarning(failure.apiError.viewedCount ?? 0); return; }
        if (failure.apiError.error === 'stale') { setStale(true); setError(t('manage.stale')); return; }
        if (failure.apiError.error === 'drawBlocked') { setBlocked(failure.apiError.stuckGiverIds ?? []); return; }
        if (failure.apiError.error === 'invalid') { setError(t('manage.invalidField', { field: failure.apiError.field ?? 'participants' })); return; }
      }
      setStale(true); setError(t('manage.applyFailed'));
    }
  };
  const requestApply = () => {
    if (!valid()) return;
    const count = view.participants.filter(person => person.opened).length;
    if (diff.requiresRedraw && count > 0) setWarning(count);
    else void submit();
  };
  const reloadBase = async () => {
    if (reloading) return;
    setReloading(true);
    try { const next = await reload(); setBase(next); setStale(false); setError(t('manage.reloaded')); }
    catch { setError(t('manage.reloadFailed')); }
    finally { setReloading(false); }
  };
  return <section className="mt-8 rounded-card border border-line bg-white p-5 sm:p-7">
    <h2 className="text-2xl text-pine">{t('manage.peopleTitle')}</h2>
    <p className="mt-2 text-caption text-muted">{t('manage.peopleHelp')}</p>
    {!base ? <><button ref={opener} className="btn-secondary mt-4" disabled={busy} onClick={() => { setBase(view); setDraft(asRecord(view)); setSaved(false); onEditing(true); }}>{t('manage.editPeople')}</button>{saved && <p className="mt-3 text-caption text-muted" role="status">{t('manage.applied')}</p>}</> : <>
      <p className="notice mt-4">{t('manage.staging')}</p>
      <fieldset disabled={busy || reloading} className="mt-4 min-w-0 space-y-4">
        <ParticipantsList autoFocusNew={false} participants={draft} onChangeParticipants={change} onOpenRules={setRulePerson}/>
        {view.emailEnabled && Object.values(draft).map(person => <label key={person.id} className="block text-caption font-bold text-pine">{t('manage.personEmail', { name: person.name })}<input type="email" className="field mt-1" maxLength={LIMITS.email} value={person.email ?? ''} onChange={event => change({ ...draft, [person.id]: { ...person, email: event.target.value } })}/></label>)}
        {blocked && <DrawBlockedNotice participants={draft} problem={{ feasible: false, stuckGiverIds: blocked, historyExclusionsInvolved: historyCount > 0 }} historyExclusionCount={historyCount} onRemoveHistoryExclusions={() => change(Object.fromEntries(Object.entries(draft).map(([id, person]) => [id, { ...person, rules: person.rules.filter(rule => rule.origin !== 'history') }])))} onDismiss={() => setBlocked(null)}/>}
        {error && <p className="notice-error" role="alert">{error}</p>}
        {stale && <button className="btn-secondary" onClick={() => void reloadBase()}>{t('manage.reloadKeepDraft')}</button>}
        <div className="flex flex-wrap gap-3"><button ref={applyButton} className="btn-primary" disabled={!diff.changed || stale} onClick={requestApply}>{busy ? t('manage.applying') : diff.requiresRedraw ? t('manage.redraw') : t('manage.savePeople')}</button><button className="btn-quiet" onClick={finish}>{t('manage.discard')}</button></div>
      </fieldset>
      {rulePerson && draft[rulePerson] && <RulesModal key={rulePerson} isOpen participantId={rulePerson} participants={draft} onChangeParticipants={change} onClose={() => setRulePerson(null)}/>}
      {warning !== null && <Modal returnFocus={applyButton.current} labelledBy="redraw-title" busy={busy} onClose={() => setWarning(null)}><h2 id="redraw-title" className="text-2xl text-pine">{t('manage.redrawWarningTitle')}</h2><p className="mt-4 text-muted">{t('manage.openedWarning', { count: warning })}</p><p className="mt-3 text-muted">{t('manage.redrawConsequences')}</p><div className="mt-6 flex flex-wrap gap-3"><button autoFocus className="btn-secondary" disabled={busy} onClick={() => setWarning(null)}>{t('manage.cancel')}</button><button className="btn-primary" disabled={busy} onClick={() => void submit(warning)}>{busy ? t('manage.applying') : t('manage.confirmRedraw')}</button></div></Modal>}
    </>}
  </section>;
}
