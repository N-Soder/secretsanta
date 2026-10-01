import { Check, Plus } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CURRENCIES, LIMITS } from '../api/limits';
import { formatEventDate, parseBudgetInput } from '../utils/format';
import type { ImportedSettings } from '../utils/historyCsv';
import { EXTRAS, type Extra } from '../utils/setupExtras';
import { Settings } from './Settings';

interface Props {
  open: ReadonlySet<Extra>;
  onToggle(extra: Extra, open: boolean): void;
  message: string;
  onChangeMessage(message: string): void;
  settings: ImportedSettings;
  onChange(settings: ImportedSettings): void;
  emailEnabled: boolean;
  reminders: boolean;
  onChangeReminders(enabled: boolean): void;
  onBudgetValidity(valid: boolean): void;
}

const centsToInput = (cents: number | null) => cents === null ? '' : String(cents / 100);

// Optional set-up details. Each one stays hidden behind a chip until chosen;
// closing a chip clears its value so nothing hidden is ever submitted.
export function SetupExtras({ open, onToggle, message, onChangeMessage, settings, onChange, emailEnabled, reminders, onChangeReminders, onBudgetValidity }: Props) {
  const { t } = useTranslation();
  const [budget, setBudget] = useState(centsToInput(settings.budgetAmount));
  const [invalidBudget, setInvalidBudget] = useState(false);
  const [focusExtra, setFocusExtra] = useState<Extra | null>(null);
  const fields = useRef<Partial<Record<Extra, HTMLElement | null>>>({});
  useEffect(() => {
    setBudget(centsToInput(settings.budgetAmount));
    setInvalidBudget(false); onBudgetValidity(true);
  }, [settings.budgetAmount]);
  useEffect(() => {
    if (focusExtra) { fields.current[focusExtra]?.focus(); setFocusExtra(null); }
  }, [focusExtra, open]);

  const available = EXTRAS.filter(extra => extra !== 'email' || emailEnabled);
  const toggle = (extra: Extra) => {
    const next = !open.has(extra);
    onToggle(extra, next);
    if (next) setFocusExtra(extra);
    else if (extra === 'budget') { setBudget(''); setInvalidBudget(false); onBudgetValidity(true); }
  };
  const showBudget = open.has('budget');
  const showDate = open.has('date');
  const showEmail = emailEnabled && open.has('email');

  return (
    <section className="mt-5 border-t border-line pt-4" aria-labelledby="extras-heading">
      <h3 id="extras-heading" className="section-label mb-2.5">{t('extras.heading')}</h3>
      <div className="flex flex-wrap gap-2">
        {available.map(extra => {
          const selected = open.has(extra);
          return (
            <button key={extra} type="button" className="chip-toggle" aria-expanded={selected} aria-controls={`extra-${extra}`} onClick={() => toggle(extra)}>
              {selected ? <Check size={14} weight="bold" aria-hidden/> : <Plus size={14} weight="bold" aria-hidden/>}
              {t(`extras.${extra}`)}
            </button>
          );
        })}
      </div>

      {(open.has('message') || showBudget || showDate || showEmail) && <div className="mt-4 space-y-4">
        {open.has('message') && <div id="extra-message">
          <Settings instructions={message} onChangeInstructions={onChangeMessage} inputRef={element => { fields.current.message = element; }}/>
        </div>}

        {(showBudget || showDate) && <div className="grid gap-4 sm:grid-cols-2">
          {showBudget && <div id="extra-budget">
            <label htmlFor="setup-budget" className="mb-2 block text-ui font-bold text-pine">{t('extras.budget')}</label>
            <div className="flex gap-2">
              <input id="setup-budget" ref={element => { fields.current.budget = element; }} className="field min-w-0" inputMode="decimal" value={budget} aria-invalid={invalidBudget} aria-describedby={invalidBudget ? 'setup-budget-error' : undefined} onChange={event => {
                const value = event.target.value; setBudget(value);
                const cents = parseBudgetInput(value);
                const invalid = cents === undefined || (cents !== null && cents > LIMITS.budgetMaxCents);
                setInvalidBudget(invalid); onBudgetValidity(!invalid);
                if (!invalid) onChange({ ...settings, budgetAmount: cents! });
              }}/>
              <select aria-label={t('extras.currency')} className="field w-24 flex-none" value={settings.budgetCurrency} onChange={event => onChange({ ...settings, budgetCurrency: event.target.value })}>
                {[...new Set([...CURRENCIES, settings.budgetCurrency])].map(code => <option key={code}>{code}</option>)}
              </select>
            </div>
            {invalidBudget && <p id="setup-budget-error" role="alert" className="mt-1 text-caption text-cranberry">{t('extras.budgetInvalid')}</p>}
          </div>}
          {showDate && <div id="extra-date">
            <label htmlFor="setup-date" className="mb-2 block text-ui font-bold text-pine">{t('extras.date')}</label>
            <input id="setup-date" ref={element => { fields.current.date = element; }} className="field" type="date" value={settings.eventDate ?? ''} onChange={event => onChange({ ...settings, eventDate: event.target.value || null })}/>
          </div>}
        </div>}

        {showEmail && <div id="extra-email">
          <label htmlFor="setup-email" className="mb-2 block text-ui font-bold text-pine">{t('extras.yourEmail')}</label>
          <input id="setup-email" ref={element => { fields.current.email = element; }} className="field" type="email" autoComplete="email" maxLength={LIMITS.email} value={settings.organiserEmail ?? ''} aria-describedby="setup-email-help" onChange={event => onChange({ ...settings, organiserEmail: event.target.value || null })}/>
          <p id="setup-email-help" className="mt-1 text-caption text-muted">
            {t('extras.emailHelp')} <Link className="underline" to="/privacy" target="_blank" rel="noopener">{t('extras.privacy')}</Link>
          </p>
        </div>}

        {showEmail && showDate && settings.eventDate && <label className="flex items-start gap-3 rounded-xl bg-ivory p-3">
          <input type="checkbox" className="mt-1 accent-pine" checked={reminders} onChange={event => onChangeReminders(event.target.checked)}/>
          <span className="text-ui">
            {t('extras.reminders', { date: formatEventDate(settings.eventDate).replace(/ \d{4}$/, '') })}
            <span className="block text-caption text-muted">{t('extras.remindersHelp')}</span>
          </span>
        </label>}
      </div>}
    </section>
  );
}
