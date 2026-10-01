import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { ImportedSettings } from '../utils/historyCsv';
import type { Participant } from '../types';
import { LIMITS } from '../api/limits';
import { parseBudgetInput } from '../utils/format';

interface Props {
  settings: ImportedSettings;
  onChange(settings: ImportedSettings): void;
  participants: Record<string, Participant>;
  onChangeParticipants(people: Record<string, Participant>): void;
  emailEnabled: boolean;
  reminders: boolean;
  onChangeReminders(enabled: boolean): void;
  onBudgetValidity(valid: boolean): void;
}
export function DrawDetails({ settings, onChange, participants, onChangeParticipants, emailEnabled, reminders, onChangeReminders, onBudgetValidity }: Props) {
  const [budget, setBudget] = useState(settings.budgetAmount === null ? '' : String(settings.budgetAmount / 100));
  const [invalidBudget, setInvalidBudget] = useState(false);
  useEffect(() => {
    setBudget(settings.budgetAmount === null ? '' : String(settings.budgetAmount / 100));
    setInvalidBudget(false); onBudgetValidity(true);
  }, [settings.budgetAmount]);
  const canRemind = !!settings.eventDate && Object.values(participants).some(person => person.email?.trim());
  useEffect(() => { if (!canRemind && reminders) onChangeReminders(false); }, [canRemind, reminders, onChangeReminders]);
  return <section className="mt-6 space-y-4 border-t border-line pt-5">
    <h3 className="text-heading text-pine">Draw details</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor="setup-budget" className="mb-2 block text-ui font-bold text-pine">Budget (optional)</label>
        <input id="setup-budget" className="field" inputMode="decimal" value={budget} aria-invalid={invalidBudget} onChange={e => {
          const value = e.target.value; setBudget(value);
          const cents = parseBudgetInput(value);
          const invalid = cents === undefined || (cents !== null && cents > LIMITS.budgetMaxCents);
          setInvalidBudget(invalid); onBudgetValidity(!invalid);
          if (!invalid) onChange({ ...settings, budgetAmount: cents! });
        }}/>{invalidBudget && <p role="alert" className="text-caption text-cranberry">Enter an amount up to 100,000 with at most two decimal places.</p>}
      </div>
      <div><label htmlFor="setup-currency" className="mb-2 block text-ui font-bold text-pine">Currency</label><input id="setup-currency" className="field" maxLength={3} value={settings.budgetCurrency} onChange={e => onChange({ ...settings, budgetCurrency: e.target.value.toUpperCase() })}/></div>
      <div className="sm:col-span-2"><label htmlFor="setup-date" className="mb-2 block text-ui font-bold text-pine">Event date (optional)</label><input id="setup-date" className="field" type="date" value={settings.eventDate ?? ''} onChange={e => onChange({ ...settings, eventDate: e.target.value || null })}/></div>
    </div>
    {emailEnabled && <>
      <div><label htmlFor="setup-email" className="mb-2 block text-ui font-bold text-pine">Your email (optional)</label><input id="setup-email" className="field" type="email" maxLength={LIMITS.email} value={settings.organiserEmail ?? ''} onChange={e => onChange({ ...settings, organiserEmail: e.target.value || null })}/><p className="mt-1 text-caption text-muted">For recovering your organiser link. Email addresses stay in this draft only until you leave or reload. <Link className="underline" to="/privacy" target="_blank" rel="noopener">Privacy</Link></p></div>
      <details><summary className="cursor-pointer text-ui font-bold text-pine">Participant emails (optional)</summary><p className="mt-2 text-caption text-muted">Used only to email each person their link and any reminders you switch on. <Link className="underline" to="/privacy" target="_blank" rel="noopener">Privacy</Link></p><div className="mt-3 space-y-3">{Object.values(participants).map(person => <div key={person.id}><label htmlFor={`setup-email-${person.id}`} className="mb-1 block text-ui">{person.name}</label><input id={`setup-email-${person.id}`} type="email" maxLength={LIMITS.email} className="field" value={person.email ?? ''} onChange={e => onChangeParticipants({ ...participants, [person.id]: { ...person, email: e.target.value } })}/></div>)}</div></details>
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-pine" checked={reminders} disabled={!canRemind} onChange={e => onChangeReminders(e.target.checked)}/><span className="text-ui">Send reminders a week and a day before the event.<span className="block text-caption text-muted">Requires a date and at least one participant email. Emails are sent only when you choose to send them, or opt into reminders.</span></span></label>
    </>}
  </section>;
}
