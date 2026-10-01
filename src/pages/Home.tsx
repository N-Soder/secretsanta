import { useEffect, useRef, useState } from 'react';
import { RulesModal } from '../components/RulesModal';
import { GeneratedPairs, checkRules, generatePairs } from '../utils/generatePairs';
import { ParticipantsList } from '../components/ParticipantsList';
import { SecretSantaLinks } from '../components/SecretSantaLinks';
import { Participant, Rule } from '../types';
import { Trans, useTranslation } from 'react-i18next';
import { PageTransition } from '../components/PageTransition';
import { ArrowLeft, ArrowRight, ArrowsClockwise, ChatText, LockSimple } from '@phosphor-icons/react';
import { Settings } from '../components/Settings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { ImportedSettings } from '../utils/historyCsv';
import { Layout } from '../components/Layout';
import { PowerUserPanel } from '../components/PowerUserPanel';
import { DrawBlockedNotice } from '../components/DrawBlockedNotice';
import { DrawFeasibility, checkDrawFeasibility, countHistoryExclusions, removeHistoryExclusions } from '../utils/historyExclusions';

type View = 'setup' | 'links';

const EXAMPLE_LINK = '/pairing?from=Simba&to=c1w%2FUV9lXC12U578BHPYZhXxhsK0fPTqoQDU9CA7W581P%2BM%3D';

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

      console.log(migrated);
    }

    return migrated;
  }

  return value;
}

function migrateAssignments(value: any) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    console.log({
      hash: ``,
      pairings: value.map(([giver, receiver]) => ({
        giver: {id: ``, name: giver},
        receiver: {id: ``, name: receiver},
      })),
    });

    return {
      hash: ``,
      pairings: value.map(([giver, receiver]) => ({
        giver: {id: ``, name: giver},
        receiver: {id: ``, name: receiver},
      })),
    };
  }

  return value;
}

export function Home() {
  const { t } = useTranslation();

  const [participants, setParticipants] = useLocalStorage<Record<string, Participant>>('secretSantaParticipants', {}, migrateParticipants);
  const [assignments, setAssignments] = useLocalStorage<GeneratedPairs | null>('secretSantaAssignments', null, migrateAssignments);
  const [instructions, setInstructions] = useLocalStorage<string>('secretSantaInstructions', '');
  const [importedSettings, setImportedSettings] = useLocalStorage<ImportedSettings>('secretSantaImportedSettings', {
    message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, organiserEmail: null,
  });

  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [view, setView] = useState<View>('setup');
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasSwitchedView = useRef(false);

  // After switching views, bring the card's top into view and move focus to its heading.
  useEffect(() => {
    if (!hasSwitchedView.current) return;

    if (cardRef.current && cardRef.current.getBoundingClientRect().top < 0) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  const showView = (next: View) => {
    hasSwitchedView.current = true;
    setView(next);
  };
  const [drawProblem, setDrawProblem] = useState<Extract<DrawFeasibility, { feasible: false }> | null>(null);

  const handleGeneratePairs = () => {
    if (Object.keys(participants).length < 2) {
      alert(t('errors.needMoreParticipants'));
      return;
    }

    const assignments = generatePairs(participants);
    if (assignments === null) {
      const feasibility = checkDrawFeasibility(participants);
      const hasRuleConflicts = Object.values(participants).some(p => checkRules(p.rules) !== null);
      // Only name people when they genuinely have nobody left; conflicting rules get the generic message.
      setDrawProblem(feasibility.feasible || hasRuleConflicts
        ? { feasible: false, stuckGiverIds: [], historyExclusionsInvolved: false }
        : feasibility);
      showView('setup');
      return;
    }

    setDrawProblem(null);
    setAssignments(assignments);
    showView('links');
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
    setAssignments(null);
    showView('setup');
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

            <p className="mt-5 lg:mt-8 flex items-center gap-2.5 text-caption text-muted">
              <LockSimple size={18} className="flex-none text-pine" aria-hidden />
              {t('home.privacy')}
            </p>
          </section>

          <div ref={cardRef} className="bg-paper border border-line rounded-card shadow-card scroll-mt-4">
            {view === 'setup' ? (
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

                <button type="button" onClick={handleGeneratePairs} className="btn-primary mt-6">
                  <ArrowsClockwise size={18} weight="bold" />
                  {t('participants.generatePairs')}
                </button>

                <p className="mt-3 text-center text-caption text-muted">
                  {t('participants.generationWarning')}
                </p>

                {assignments && (
                  <div className="mt-1 text-center">
                    <button type="button" onClick={() => showView('links')} className="btn-quiet">
                      {t('links.viewLast')}
                      <ArrowRight size={14} weight="bold" aria-hidden />
                    </button>
                  </div>
                )}
              </div>

              <PowerUserPanel
                participants={participants}
                onChangeParticipants={handleChangeParticipants}
                onImport={handleImportHistory}
              />
              </>
            ) : (
              <div className="p-5 sm:p-6">
                <button type="button" onClick={() => showView('setup')} className="btn-quiet -mt-1 mb-2">
                  <ArrowLeft size={14} weight="bold" aria-hidden />
                  {t('links.back')}
                </button>
                <h2 ref={headingRef} tabIndex={-1} className="text-title text-pine mb-1 focus:outline-none">{t('links.heading')}</h2>
                {assignments ? (
                  <SecretSantaLinks
                    assignments={assignments}
                    instructions={instructions}
                    settings={{ ...importedSettings, message: instructions }}
                    participants={participants}
                    onGeneratePairs={handleGeneratePairs}
                  />
                ) : (
                  <p className="text-ui text-muted">{t('links.notReady')}</p>
                )}
              </div>
            )}
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
