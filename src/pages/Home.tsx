import { useState } from 'react';
import { RulesModal } from '../components/RulesModal';
import { GeneratedPairs, checkRules, generatePairs } from '../utils/generatePairs';
import { Accordion } from '../components/Accordion';
import { AccordionContainer } from '../components/AccordionContainer';
import { ParticipantsList } from '../components/ParticipantsList';
import { ParticipantsTextView } from '../components/ParticipantsTextView';
import { SecretSantaLinks } from '../components/SecretSantaLinks';
import { Participant, Rule } from '../types';
import { Link } from 'react-router-dom';
import { PostCard } from '../components/PostCard';
import { Trans, useTranslation } from 'react-i18next';
import { MenuItem } from '../components/SideMenu';
import { PageTransition } from '../components/PageTransition';
import { Code, Heart, Rows, Star } from '@phosphor-icons/react';
import { Settings } from '../components/Settings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Layout } from '../components/Layout';
import { ImportHistory } from '../components/ImportHistory';
import { DrawBlockedNotice } from '../components/DrawBlockedNotice';
import { DrawFeasibility, checkDrawFeasibility, countHistoryExclusions, removeHistoryExclusions } from '../utils/historyExclusions';

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
  const [openSection, setOpenSection] = useState<'participants' | 'links' | 'settings'>('participants');
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

  const menuItems = [
    <div className="flex flex-col space-y-2 lg:flex-row lg:space-y-0 lg:space-x-2">
      <MenuItem key={`vanity`} to="https://bsky.app/profile/mael.dev" icon={<Star className={`text-orange-500`} weight={`fill`}/>}>
        {t(`home.vanity`)}
      </MenuItem>
      <MenuItem key={`sponsor`} to="https://github.com/sponsors/arcanis?frequency=one-time&sponsor=arcanis" icon={<Heart className={`text-red-700`} weight={`fill`}/>}>
        {t(`home.sponsor`)}
      </MenuItem>
    </div>,
  ];

  const toggleViewButton = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setIsTextView(!isTextView);
      }}
      className="p-2 text-gray-200 hover:bg-gray-700 rounded-full"
      title={t(isTextView ? 'participants.switchToFormView' : 'participants.switchToTextView')}
    >
      {isTextView ? <Rows size={20} weight={`bold`} /> : <Code size={20} weight={`bold`} />}
    </button>
  );

  return <>
    <PageTransition>
      <Layout menuItems={menuItems}>
        <div className="lg:flex-[6_6_0%]">
          <PostCard>
            <div className="space-y-4">
              <h1 className="text-xl sm:text-2xl font-bold mb-4 text-red-700">
                {t('home.title')}
              </h1>
              <div className="space-y-4 text-gray-600">
                <Trans
                  i18nKey="home.explanation"
                  components={{
                    p: <p/>,
                    githubLink: <a className="text-blue-500 underline" href="https://github.com/arcanis/secretsanta/" target="_blank"/>,
                    exampleLink: <Link className="text-blue-500 underline" to="/pairing?from=Simba&to=c1w%2FUV9lXC12U578BHPYZhXxhsK0fPTqoQDU9CA7W581P%2BM%3D"/>,
                  }}
                />
              </div>
            </div>
          </PostCard>
        </div>

        <div className="lg:order-none lg:flex-[5_5_0%]">
          <AccordionContainer>
            <Accordion
              title={t('participants.title')}
              isOpen={openSection === 'participants'}
              onToggle={() => setOpenSection('participants')}
              action={toggleViewButton}
            >
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
              <div className="mt-4">
                <ImportHistory
                  currentParticipantCount={Object.keys(participants).length}
                  onImport={handleImportHistory}
                />
              </div>
            </Accordion>

            <Accordion
              title={t('settings.title')}
              isOpen={openSection === 'settings'}
              onToggle={() => setOpenSection('settings')}
            >
              <Settings
                instructions={instructions}
                onChangeInstructions={setInstructions}
              />
            </Accordion>

            {assignments && (
              <Accordion
                title={t('links.title')}
                isOpen={openSection === 'links'}
                onToggle={() => setOpenSection('links')}
              >
                <SecretSantaLinks
                  assignments={assignments}
                  instructions={instructions}
                  participants={participants}
                  onGeneratePairs={handleGeneratePairs}
                />
              </Accordion>
            )}
          </AccordionContainer>
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