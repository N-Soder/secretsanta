import { useState } from 'react';
import { RulesModal } from '../components/RulesModal';
import { GeneratedPairs, checkRules, generatePairs } from '../utils/generatePairs';
import { ParticipantsList } from '../components/ParticipantsList';
import { ParticipantsTextView } from '../components/ParticipantsTextView';
import { SecretSantaLinks } from '../components/SecretSantaLinks';
import { Participant, Rule } from '../types';
import { Trans, useTranslation } from 'react-i18next';
import { PageTransition } from '../components/PageTransition';
import { LockSimple } from '@phosphor-icons/react';
import { StepTab, StepTabs } from '../components/StepTabs';
import { Settings } from '../components/Settings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Layout } from '../components/Layout';
import { ImportHistory } from '../components/ImportHistory';
import { DrawBlockedNotice } from '../components/DrawBlockedNotice';
import { DrawFeasibility, checkDrawFeasibility, countHistoryExclusions, removeHistoryExclusions } from '../utils/historyExclusions';

type Section = 'participants' | 'settings' | 'links';

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
  const [openSection, setOpenSection] = useState<Section>('participants');
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
      setOpenSection('participants');
      return;
    }

    setDrawProblem(null);
    setAssignments(assignments);
    setOpenSection('links');
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
    setOpenSection('participants');
  };

  const tabs: StepTab<Section>[] = [
    { id: 'participants', label: t('participants.title') },
    { id: 'settings', label: t('settings.title') },
    { id: 'links', label: t('links.title') },
  ];

  const participantCount = Object.keys(participants).length;

  return <>
    <PageTransition>
      <Layout headerLink={{ to: EXAMPLE_LINK, label: t('home.exampleLink') }}>
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-start pt-2 lg:pt-8">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
              {t('home.eyebrow')}
            </p>
            <h1 className="mt-3 mb-5 text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.04] text-pine">
              <Trans i18nKey="home.title" components={{ em: <em className="text-cranberry"/> }}/>
            </h1>
            <p className="text-[17px] leading-relaxed text-body max-w-[30em]">
              {t('home.lede')}
            </p>

            <ol className="hidden lg:grid gap-4 mt-8">
              {(['participants', 'message', 'links'] as const).map((step, index) => (
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

            <p className="mt-8 flex items-center gap-2.5 text-sm text-muted">
              <LockSimple size={18} className="flex-none text-pine" aria-hidden />
              {t('home.privacy')}
            </p>
          </section>

          <div className="bg-paper border border-line rounded-[18px] shadow-card overflow-hidden">
            <StepTabs tabs={tabs} selected={openSection} onSelect={setOpenSection} idPrefix="home"/>

            <div
              role="tabpanel"
              id={`home-panel-${openSection}`}
              aria-labelledby={`home-tab-${openSection}`}
              className="p-5 sm:p-6"
            >
              {openSection === 'participants' && <>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-[26px] text-pine">{t('participants.heading')}</h2>
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
                    onGeneratePairs={handleGeneratePairs}
                  />
                ) : (
                  <ParticipantsList
                    participants={participants}
                    onChangeParticipants={handleChangeParticipants}
                    onOpenRules={(id) => {
                      setSelectedParticipantId(id);
                      setIsRulesModalOpen(true);
                    }}
                    onGeneratePairs={handleGeneratePairs}
                  />
                )}

                <div className="flex items-center justify-between gap-3 mt-3">
                  <ImportHistory
                    currentParticipantCount={participantCount}
                    onImport={handleImportHistory}
                  />
                  <span className="text-[13px] text-muted">
                    {t('participants.count', { count: participantCount })}
                  </span>
                </div>
              </>}

              {openSection === 'settings' && <>
                <h2 className="text-[26px] text-pine mb-4">{t('settings.heading')}</h2>
                <Settings
                  instructions={instructions}
                  onChangeInstructions={setInstructions}
                />
              </>}

              {openSection === 'links' && <>
                <h2 className="text-[26px] text-pine mb-1">{t('links.heading')}</h2>
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
              </>}
            </div>
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
