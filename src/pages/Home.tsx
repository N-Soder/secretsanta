import { useEffect, useRef, useState } from 'react';
import { RulesModal } from '../components/RulesModal';
import { GeneratedPairs, checkRules, generatePairs } from '../utils/generatePairs';
import { ParticipantsList } from '../components/ParticipantsList';
import { ParticipantsTextView } from '../components/ParticipantsTextView';
import { SecretSantaLinks } from '../components/SecretSantaLinks';
import { Participant, Rule } from '../types';
import { Trans, useTranslation } from 'react-i18next';
import { PageTransition } from '../components/PageTransition';
import { ArrowLeft, ArrowRight, ArrowsClockwise, ChatText, LockSimple } from '@phosphor-icons/react';
import { Settings } from '../components/Settings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Layout } from '../components/Layout';
import { ImportHistory } from '../components/ImportHistory';
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
  const [isTextView, setIsTextView] = useState(false);

  const [participants, setParticipants] = useLocalStorage<Record<string, Participant>>('secretSantaParticipants', {}, migrateParticipants);
  const [assignments, setAssignments] = useLocalStorage<GeneratedPairs | null>('secretSantaAssignments', null, migrateAssignments);
  const [instructions, setInstructions] = useLocalStorage<string>('secretSantaInstructions', '');

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

  const handleImportHistory = (importedParticipants: Record<string, Participant>, importedInstructions: string) => {
    setDrawProblem(null);
    setParticipants(importedParticipants);
    setInstructions(importedInstructions);
    setAssignments(null);
    setIsTextView(false);
    showView('setup');
  };

  const participantCount = Object.keys(participants).length;

  return <>
    <PageTransition>
      <Layout headerLink={{ to: EXAMPLE_LINK, label: t('home.exampleLink') }}>
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-start pt-2 lg:pt-8">
          <section>
            <p className="hidden sm:block text-xs font-bold uppercase tracking-[0.18em] text-gold">
              {t('home.eyebrow')}
            </p>
            <h1 className="sm:mt-3 mb-4 sm:mb-5 text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.04] text-pine">
              <Trans i18nKey="home.title" components={{ em: <em className="text-cranberry"/> }}/>
            </h1>
            <p className="text-[17px] leading-relaxed text-body max-w-[30em]">
              {t('home.lede')}
            </p>

            <ol className="hidden lg:grid gap-4 mt-8">
              {(['setup', 'draw', 'share'] as const).map((step, index) => (
                <li key={step} className="grid grid-cols-[34px_1fr] gap-3.5 items-start">
                  <span className="grid place-items-center w-[34px] h-[34px] rounded-full border-[1.5px] border-gold font-display text-[17px] text-pine">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-bold text-pine">{t(`home.steps.${step}Title`)}</span>
                    <span className="block text-[15px] leading-normal text-muted">{t(`home.steps.${step}Body`)}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-5 lg:mt-8 flex items-center gap-2.5 text-sm text-muted">
              <LockSimple size={18} className="flex-none text-pine" aria-hidden />
              {t('home.privacy')}
            </p>
          </section>

          <div ref={cardRef} className="bg-paper border border-line rounded-[18px] shadow-card scroll-mt-4">
            {view === 'setup' ? (
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 ref={headingRef} tabIndex={-1} className="text-[26px] text-pine focus:outline-none">{t('participants.heading')}</h2>
                  <div role="group" aria-label={t('participants.viewLabel')} className="flex-none inline-flex border border-line rounded-full p-[3px] text-xs">
                    {([false, true] as const).map(textView => (
                      <button
                        key={String(textView)}
                        type="button"
                        aria-pressed={isTextView === textView}
                        onClick={() => setIsTextView(textView)}
                        className={`px-2.5 py-1 rounded-full transition-colors ${
                          isTextView === textView ? 'bg-ivory text-pine font-bold' : 'text-muted hover:text-pine'
                        }`}
                      >
                        {t(textView ? 'participants.textView' : 'participants.listView')}
                      </button>
                    ))}
                  </div>
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

                {isTextView ? (
                  <ParticipantsTextView
                    participants={participants}
                    onChangeParticipants={handleChangeParticipants}
                  />
                ) : (
                  <ParticipantsList
                    participants={participants}
                    onChangeParticipants={handleChangeParticipants}
                    onOpenRules={(id) => {
                      setSelectedParticipantId(id);
                      setIsRulesModalOpen(true);
                    }}
                  />
                )}

                <div className="flex items-center justify-between gap-3 mt-2">
                  <ImportHistory
                    currentParticipantCount={participantCount}
                    onImport={handleImportHistory}
                  />
                  <span className="text-[13px] text-muted">
                    {t('participants.count', { count: participantCount })}
                  </span>
                </div>

                <div className="mt-4 pt-5 border-t border-line">
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
                      className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-[#D9D1BF] px-3 py-3 text-left text-[15px] text-pine transition-colors hover:border-gold"
                    >
                      <ChatText size={18} weight="bold" className="flex-none text-gold" aria-hidden />
                      <span>
                        {t('settings.addMessage')}
                        <span className="text-muted"> {t('settings.addMessageHint')}</span>
                      </span>
                    </button>
                  )}
                </div>

                <p className="mt-5 mb-4 text-[13px] leading-normal text-muted">
                  {t('participants.generationWarning')}
                </p>

                <button type="button" onClick={handleGeneratePairs} className="btn-primary">
                  <ArrowsClockwise size={18} weight="bold" />
                  {t('participants.generatePairs')}
                </button>

                {assignments && (
                  <div className="mt-3 text-center">
                    <button type="button" onClick={() => showView('links')} className="btn-quiet">
                      {t('links.viewLast')}
                      <ArrowRight size={14} weight="bold" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <button type="button" onClick={() => showView('setup')} className="btn-quiet -mt-1 mb-2">
                  <ArrowLeft size={14} weight="bold" aria-hidden />
                  {t('links.back')}
                </button>
                <h2 ref={headingRef} tabIndex={-1} className="text-[26px] text-pine mb-1 focus:outline-none">{t('links.heading')}</h2>
                {assignments ? (
                  <SecretSantaLinks
                    assignments={assignments}
                    instructions={instructions}
                    participants={participants}
                    onGeneratePairs={handleGeneratePairs}
                  />
                ) : (
                  <p className="text-[15px] text-muted">{t('links.notReady')}</p>
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
