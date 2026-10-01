import { useEffect, useRef, useState } from 'react';
import type { ManageView, PatchRequest } from '../../api/types';
import { LIMITS, EMAIL_PATTERN } from '../../api/limits';
import { formatBudget, formatEventDate, parseBudgetInput } from '../../utils/format';

type Save = (patch: PatchRequest) => Promise<void>;
type Drafts = Record<string, string>;
export function GroupDetails({ view, save, emailEnabled }: { view: ManageView; save: Save; emailEnabled: boolean }) {
  const initial: Drafts = {
    message: view.settings.message,
    budget: view.settings.budgetAmount === null ? '' : (view.settings.budgetAmount / 100).toFixed(view.settings.budgetAmount % 100 ? 2 : 0),
    currency: view.settings.budgetCurrency,
    eventDate: view.settings.eventDate ?? '',
    organiserEmail: view.settings.organiserEmail ?? '',
    remindersEnabled: String(view.settings.remindersEnabled),
  };
  const [drafts, setDrafts] = useState(initial);
  const [status, setStatus] = useState<Record<string, string>>({});
  const dirty = useRef(new Set<string>());
  const versions = useRef<Record<string, number>>({});
  const [people, setPeople] = useState(() => Object.fromEntries(view.participants.map(person => [person.id, { name: person.name, hint: person.hint, email: person.email ?? '' }])) as Record<string, { name: string; hint: string; email: string }>);
  const personDirty = useRef(new Set<string>());
  const personVersions = useRef<Record<string, number>>({});
  useEffect(() => {
    setDrafts(current => Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, dirty.current.has(key) ? current[key] : value])));
    setPeople(current => Object.fromEntries(view.participants.map(person => [person.id, personDirty.current.has(person.id) ? current[person.id] : { name: person.name, hint: person.hint, email: person.email ?? '' }])));
  }, [view.revision]);
  const change = (key: string, value: string) => {
    dirty.current.add(key); versions.current[key] = (versions.current[key] ?? 0) + 1;
    setDrafts(current => ({ ...current, [key]: value }));
  };
  const saveField = async (key: string) => {
    const value = drafts[key];
    const version = versions.current[key] ?? 0;
    const patch: PatchRequest = { settings: {} };
    if (key === 'message') {
      if (value.length > LIMITS.message) { setStatus(s => ({ ...s, [key]: `Maximum ${LIMITS.message} characters.` })); return; }
      if (value === view.settings.message) return;
      patch.settings!.message = value;
    } else if (key === 'budget') {
      const cents = parseBudgetInput(value);
      if (cents === undefined || (cents !== null && cents > LIMITS.budgetMaxCents)) { setStatus(s => ({ ...s, [key]: 'Enter a valid amount up to 100,000.' })); return; }
      if (cents === view.settings.budgetAmount) return;
      patch.settings!.budgetAmount = cents;
    } else if (key === 'currency') {
      if (!['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'].includes(value)) { setStatus(s => ({ ...s, [key]: 'Choose a supported currency.' })); return; }
      if (value === view.settings.budgetCurrency) return;
      patch.settings!.budgetCurrency = value;
    } else if (key === 'eventDate') {
      const date = value || null;
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) { setStatus(s => ({ ...s, [key]: 'Enter a valid date.' })); return; }
      if (date === view.settings.eventDate) return;
      patch.settings!.eventDate = date;
    } else if (key === 'organiserEmail') {
      const email = value.trim() || null;
      if (email && (email.length > LIMITS.email || !EMAIL_PATTERN.test(email))) { setStatus(s => ({ ...s, [key]: 'Enter a valid email address.' })); return; }
      if (email === view.settings.organiserEmail) { change(key, email ?? ''); return; }
      patch.settings!.organiserEmail = email;
    } else if (key === 'remindersEnabled') {
      const enabled = value === 'true';
      if (enabled === view.settings.remindersEnabled) return;
      patch.settings!.remindersEnabled = enabled;
    }
    setStatus(s => ({ ...s, [key]: 'Saving…' }));
    try { await save(patch); if ((versions.current[key] ?? 0) === version) dirty.current.delete(key); setStatus(s => ({ ...s, [key]: 'Saved' })); }
    catch { setStatus(s => ({ ...s, [key]: 'Couldn’t save. Try again.' })); }
  };
  const changePerson = (id: string, key: 'name' | 'hint' | 'email', value: string) => {
    personDirty.current.add(id); personVersions.current[id] = (personVersions.current[id] ?? 0) + 1;
    setPeople(current => ({ ...current, [id]: { ...current[id], [key]: value } }));
  };
  const savePerson = async (id: string, key: 'name' | 'hint' | 'email') => {
    const value = people[id]?.[key] ?? '';
    const person = view.participants.find(item => item.id === id);
    if (!person) return;
    if (key === 'name' && (!value.trim() || value.length > LIMITS.name)) { setStatus(s => ({ ...s, [`${id}.${key}`]: 'Enter a name up to 80 characters.' })); return; }
    if (key === 'hint' && value.length > LIMITS.hint) { setStatus(s => ({ ...s, [`${id}.${key}`]: 'Maximum 300 characters.' })); return; }
    const normalised = key === 'email' ? value.trim() || null : value;
    if (key === 'email' && normalised && (normalised.length > LIMITS.email || !EMAIL_PATTERN.test(normalised))) { setStatus(s => ({ ...s, [`${id}.${key}`]: 'Enter a valid email address.' })); return; }
    if (normalised === (key === 'email' ? person.email : person[key])) {
      personDirty.current.delete(id);
      setStatus(s => ({ ...s, [`${id}.${key}`]: '' }));
      return;
    }
    const version = personVersions.current[id] ?? 0;
    setStatus(s => ({ ...s, [`${id}.${key}`]: 'Saving…' }));
    try { await save({ participants: [{ id, [key]: normalised }] }); const unchanged = (personVersions.current[id] ?? 0) === version; if (unchanged) personDirty.current.delete(id); setStatus(s => ({ ...s, [`${id}.${key}`]: unchanged ? 'Saved' : 'Unsaved changes' })); }
    catch { setStatus(s => ({ ...s, [`${id}.${key}`]: 'Couldn’t save. Try again.' })); }
  };
  const emailHelp = <a href="/privacy" className="ml-1 text-caption text-pine underline underline-offset-2">Privacy</a>;
  return <section className="mt-8 rounded-card border border-line bg-white p-5 sm:p-7">
    <h2 className="text-2xl text-pine">Group details</h2>
    <p className="mt-2 text-caption text-muted">Changes save when you leave a field. Budget and date are shown to participants.</p>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2"><label htmlFor="group-message" className="mb-2 block font-bold text-pine">Message for everyone</label><textarea id="group-message" maxLength={LIMITS.message} value={drafts.message} onChange={e => change('message', e.target.value)} onBlur={() => void saveField('message')} className="field min-h-24"/><FieldStatus value={status.message}/></div>
      <div><label htmlFor="group-budget" className="mb-2 block font-bold text-pine">Budget</label><div className="flex gap-2"><input id="group-budget" inputMode="decimal" aria-label="Budget amount" className="field min-w-0" value={drafts.budget} onChange={e => change('budget', e.target.value)} onBlur={() => void saveField('budget')} placeholder="Optional"/><select aria-label="Currency" className="field w-28" value={drafts.currency} onChange={e => { change('currency', e.target.value); }} onBlur={() => void saveField('currency')}><option>AUD</option><option>NZD</option><option>USD</option><option>GBP</option><option>EUR</option><option>CAD</option></select></div>{view.settings.budgetAmount !== null && <p className="mt-1 text-caption text-muted">Current: {formatBudget(view.settings.budgetAmount, view.settings.budgetCurrency)}</p>}<FieldStatus value={status.budget || status.currency}/></div>
      <div><label htmlFor="group-date" className="mb-2 block font-bold text-pine">Event date</label><input id="group-date" type="date" className="field" value={drafts.eventDate} onChange={e => change('eventDate', e.target.value)} onBlur={() => void saveField('eventDate')}/>{view.settings.eventDate && <p className="mt-1 text-caption text-muted">Current: {formatEventDate(view.settings.eventDate)}</p>}<FieldStatus value={status.eventDate}/></div>
      {emailEnabled && <div className="sm:col-span-2"><label htmlFor="organiser-email" className="mb-2 block font-bold text-pine">Your email {emailHelp}</label><input id="organiser-email" type="email" maxLength={LIMITS.email} className="field" value={drafts.organiserEmail} onChange={e => change('organiserEmail', e.target.value)} onBlur={() => void saveField('organiserEmail')} placeholder="For recovering your organiser link"/><FieldStatus value={status.organiserEmail}/></div>}
      {emailEnabled && <div className="sm:col-span-2"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-pine" checked={drafts.remindersEnabled === 'true'} disabled={!view.settings.eventDate || !view.participants.some(person => people[person.id]?.email.trim())} onChange={e => { const enabled = e.target.checked; change('remindersEnabled', String(enabled)); setStatus(s => ({ ...s, remindersEnabled: 'Saving…' })); void save({ settings: { remindersEnabled: enabled } }).then(() => { dirty.current.delete('remindersEnabled'); setStatus(s => ({ ...s, remindersEnabled: 'Saved' })); }).catch(() => setStatus(s => ({ ...s, remindersEnabled: 'Couldn’t save. Try again.' }))); }} /><span><span className="font-bold text-pine">Send reminders</span><span className="mt-1 block text-caption text-muted">A week and a day before the event, to people with an email address. Add a date and at least one participant email to enable this.</span></span></label><FieldStatus value={status.remindersEnabled}/></div>}
    </div>
    <div className="mt-7 border-t border-line pt-5"><h3 className="text-xl text-pine">People</h3><p className="mt-1 text-caption text-muted">Names, gift hints and email addresses save when you leave a field. Changing these details won’t redraw the matches.</p><div className="mt-4 space-y-4">{view.participants.map(person => <div key={person.id} className="rounded-xl bg-ivory/70 p-4"><p className="mb-3 font-bold text-pine">Participant details</p><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`name-${person.id}`} className="mb-1 block text-caption font-bold">Name</label><input id={`name-${person.id}`} maxLength={LIMITS.name} className="field" value={people[person.id]?.name ?? person.name} onChange={e => changePerson(person.id, 'name', e.target.value)} onBlur={() => void savePerson(person.id, 'name')}/><FieldStatus value={status[`${person.id}.name`]}/></div><div><label htmlFor={`hint-${person.id}`} className="mb-1 block text-caption font-bold">Gift hint</label><input id={`hint-${person.id}`} maxLength={LIMITS.hint} className="field" value={people[person.id]?.hint ?? person.hint} onChange={e => changePerson(person.id, 'hint', e.target.value)} onBlur={() => void savePerson(person.id, 'hint')}/><FieldStatus value={status[`${person.id}.hint`]}/></div>{emailEnabled && <div className="sm:col-span-2"><label htmlFor={`email-${person.id}`} className="mb-1 block text-caption font-bold">Email <a href="/privacy" className="ml-1 font-normal text-pine underline">Privacy</a></label><input id={`email-${person.id}`} type="email" maxLength={LIMITS.email} className="field" value={people[person.id]?.email ?? person.email ?? ''} onChange={e => changePerson(person.id, 'email', e.target.value)} onBlur={() => void savePerson(person.id, 'email')}/><FieldStatus value={status[`${person.id}.email`]}/></div>}</div></div>)}</div></div>
  </section>;
}
function FieldStatus({ value }: { value?: string }) { return value ? <p className={`mt-1 text-caption ${value.startsWith('Couldn’t') || value.startsWith('Enter') || value.startsWith('Maximum') ? 'text-cranberry-dark' : 'text-muted'}`} role="status">{value}</p> : null; }
