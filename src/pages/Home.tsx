import { useRef, useState } from 'react';
import { RulesModal } from '../components/RulesModal';
import { ParticipantsList } from '../components/ParticipantsList';
import { Participant, Rule } from '../types';
import { Trans, useTranslation } from 'react-i18next';
import { PageTransition } from '../components/PageTransition';
import { ArrowsClockwise, ChatText, LockSimple } from '@phosphor-icons/react';
import { Settings } from '../components/Settings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { ImportedSettings } from '../utils/historyCsv';
import { Layout } from '../components/Layout';
import { PowerUserPanel } from '../components/PowerUserPanel';
import { DrawBlockedNotice } from '../components/DrawBlockedNotice';
import { DrawFeasibility, countHistoryExclusions, removeHistoryExclusions } from '../utils/historyExclusions';

import { Link, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useConfig } from '../hooks/useConfig';
import { Turnstile, type TurnstileHandle } from '../components/Turnstile';
import { DrawDetails } from '../components/DrawDetails';
import { CONTINUATION_KEY } from '../utils/continuation';
import { sanitiseParticipants, sanitiseSettings } from '../utils/setupDraft';

const EXAMPLE_LINK = '/s/demo';

function migrateParticipants(value: any) {
  // The first release of the new tool used an array of participants.
  if (Array.isArray(value)) {
    const migrated: Record<string, Participant> = {};
    const ids = new Map<string, string>();

    for (const participant of value) {
      const id = crypto.randomUUID();
      ids.set(participant.name, id);
    }

    for (const participant of value) {
      const id = ids.get(participant.name)!;

      migrated[id] = {
        id,
        name: participant.name,
        rules: participant.rules.map(({type, targetParticipant}: {type: string, targetParticipant: string}) => {
          const targetParticipantId = ids.get(targetParticipant);
          return targetParticipantId ? {type, targetParticipantId} : null;
        }).filter((rule: any): rule is Rule => {
          return !!rule;
        }),
      };
    }

    return migrated;
  }

  return value;
}

export function Home() {
  const { t } = useTranslation();

  const [participants, setParticipants] = useLocalStorage<Record<string, Participant>>('secretSantaParticipants', {}, value => sanitiseParticipants(migrateParticipants(value)), sanitiseParticipants);
  const [instructions, setInstructions] = useLocalStorage<string>('secretSantaInstructions', '');
  const [importedSettings, setImportedSettings] = useLocalStorage<ImportedSettings>('secretSantaImportedSettings', {
    message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null,
  }, sanitiseSettings, sanitiseSettings);

  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const config = useConfig();
  const emailEnabled = config.status === 'ready' && config.config.emailEnabled;
  const verification = useRef<TurnstileHandle>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [budgetValid, setBudgetValid] = useState(true);
  const [reminders, setReminders] = useLocalStorage('secretSantaReminders', false);
  const [continuation] = useLocalStorage<string | null>(CONTINUATION_KEY, null);
  const [drawProblem, setDrawProblem] = useState<Extract<DrawFeasibility, { feasible: false }> | null>(null);


  const handleGeneratePairs = async () => {
    if (submitting.current || !verification.current || !budgetValid) return;
    submitting.current = true; setPending(true); setError(''); setDrawProblem(null);
    try {
      const result = await verification.current.run(turnstileToken => api.create({
        turnstileToken,
        settings: { ...importedSettings, message: instructions, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          remindersEnabled: emailEnabled && reminders,
          organiserEmail: emailEnabled ? importedSettings.organiserEmail : null },
        participants: Object.values(participants).map(person => ({ ...person, hint: person.hint ?? '', email: emailEnabled ? person.email?.trim() || null : null })),
      }));
      try { localStorage.setItem(CONTINUATION_KEY, JSON.stringify(result.manageToken)); } catch { /* The organiser page still provides the link. */ }
      try {
        for (const key of ['secretSantaParticipants', 'secretSantaInstructions', 'secretSantaImportedSettings', 'secretSantaReminders']) localStorage.removeItem(key);
      } catch { /* Storage may be blocked. */ }
      setParticipants({}); setInstructions(''); setImportedSettings({ message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null }); setReminders(false);
      navigate(`/manage/${encodeURIComponent(result.manageToken)}`);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.apiError.error === 'drawBlocked') {
        setDrawProblem({ feasible: false, stuckGiverIds: cause.apiError.stuckGiverIds ?? [], historyExclusionsInvolved: countHistoryExclusions(participants) > 0 });
      } else setError(cause instanceof ApiClientError && cause.apiError.error === 'invalid'
        ? `Check ${cause.apiError.field ?? 'your group details'} and try again.`
        : 'Couldn’t create your group. Your draft is still here. Complete verification and try again.');
    } finally { submitting.current = false; setPending(false); }
  };

  const handleChangeParticipants = (newParticipants: Record<string, Participant>) => {
    setDrawProblem(null);
    setParticipants(newParticipants);
  };

  const handleImportHistory = (importedParticipants: Record<string, Participant>, settings: ImportedSettings) => {
    setDrawProblem(null);
    setParticipants(importedParticipants);
    setInstructions(settings.message);
    setImportedSettings(settings);
  };

  const participantCount = Object.keys(participants).length;

  return <>
    <PageTransition>
      <Layout headerLink={{ to: EXAMPLE_LINK, label: t('home.exampleLink') }}>
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 lg:gap-14 items-start pt-2 lg:pt-8">
          <section>
            <p className="eyebrow hidden sm:block">
              {t('home.eyebrow')}
            </p>
            <h1 className="sm:mt-3 mb-4 sm:mb-5 text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.04] text-pine">
              <Trans i18nKey="home.title" components={{ em: <em className="text-cranberry"/> }}/>
            </h1>
            <p className="text-lede text-body max-w-[30em]">
              {t('home.lede')}
            </p>

            <ol className="hidden lg:grid gap-4 mt-8">
              {(['setup', 'draw', 'share'] as const).map((step, index) => (
                <li key={step} className="grid grid-cols-[34px_1fr] gap-3.5 items-start">
                  <span className="grid place-items-center w-[34px] h-[34px] rounded-full border-[1.5px] border-gold font-display text-lede text-pine">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-ui font-bold text-pine">{t(`home.steps.${step}Title`)}</span>
                    <span className="block text-ui text-muted">{t(`home.steps.${step}Body`)}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap gap-4">
              {continuation && <Link className="btn-secondary" to={`/manage/${encodeURIComponent(continuation)}`}>Continue your group</Link>}
              <Link className="btn-quiet" to="/recover">Recover your link</Link>
            </div>
            <p className="mt-5 lg:mt-8 flex items-center gap-2.5 text-caption text-muted">
              <LockSimple size={18} className="flex-none text-pine" aria-hidden />
              {t('home.privacy')}
            </p>
          </section>

          <div ref={cardRef} className="bg-paper border border-line rounded-card shadow-card scroll-mt-4">
            <fieldset disabled={pending} className="min-w-0">
              <>
              <div className="p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h2 ref={headingRef} tabIndex={-1} className="text-title text-pine focus:outline-none">{t('participants.heading')}</h2>
                  <span className="flex-none text-caption text-muted">
                    {t('participants.count', { count: participantCount })}
                  </span>
                </div>

                {drawProblem && (
                  <div className="mb-4">
                    <DrawBlockedNotice
                      problem={drawProblem}
                      participants={participants}
                      historyExclusionCount={countHistoryExclusions(participants)}
                      onRemoveHistoryExclusions={() => handleChangeParticipants(removeHistoryExclusions(participants))}
                      onDismiss={() => setDrawProblem(null)}
                    />
                  </div>
                )}

                <ParticipantsList
                  participants={participants}
                  onChangeParticipants={handleChangeParticipants}
                  onOpenRules={(id) => {
                    setSelectedParticipantId(id);
                    setIsRulesModalOpen(true);
                  }}
                />

                <div className="mt-5">
                  {isMessageOpen || instructions ? (
                    <Settings
                      instructions={instructions}
                      onChangeInstructions={(value) => {
                        // Stay open once edited, so clearing the text doesn't hide the field mid-edit.
                        setIsMessageOpen(true);
                        setInstructions(value);
                      }}
                      autoFocus={isMessageOpen && !instructions}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsMessageOpen(true)}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3 py-3 text-left text-ui text-pine transition-colors hover:border-gold"
                    >
                      <ChatText size={18} weight="bold" className="flex-none text-gold" aria-hidden />
                      <span>
                        {t('settings.addMessage')}
                        <span className="text-muted"> {t('settings.addMessageHint')}</span>
                      </span>
                    </button>
                  )}
                </div>

                <DrawDetails settings={importedSettings} onChange={setImportedSettings} participants={participants} onChangeParticipants={handleChangeParticipants} emailEnabled={emailEnabled} reminders={reminders} onChangeReminders={setReminders} onBudgetValidity={setBudgetValid}/>
                {config.status === 'loading' && <p role="status">Loading verification…</p>}
                {config.status === 'error' && <div role="alert">Couldn’t load verification. <button type="button" className="btn-quiet" onClick={() => void config.retry()}>Retry</button></div>}
                {config.status === 'ready' && <div className="mt-5"><Turnstile ref={verification} siteKey={config.config.turnstileSiteKey} onTokenChange={token => setVerified(!!token)}/></div>}
                {error && <p role="alert" className="notice-error mt-4">{error}</p>}
                <button type="button" disabled={pending || !verified || !budgetValid || participantCount < 2} onClick={() => void handleGeneratePairs()} className="btn-primary mt-6 disabled:opacity-50">
                  <ArrowsClockwise size={18} weight="bold" />
                  {pending ? 'Creating your group…' : t('participants.generatePairs')}
                </button>
              </div>

              <PowerUserPanel
                participants={participants}
                onChangeParticipants={handleChangeParticipants}
                onImport={handleImportHistory}
              />
              </>
            </fieldset>
          </div>
        </div>
      </Layout>
    </PageTransition>
    {isRulesModalOpen && selectedParticipantId && (
      <RulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        participants={participants}
        participantId={selectedParticipantId}
        onChangeParticipants={handleChangeParticipants}
      />
    )}
  </>;
}
