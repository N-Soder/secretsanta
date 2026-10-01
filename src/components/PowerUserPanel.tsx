import { useId, useState } from 'react';
import { CaretDown, Code } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Participant } from '../types';
import { ParticipantsTextView } from './ParticipantsTextView';
import { ImportHistory } from './ImportHistory';
import type { ImportedSettings } from '../utils/historyCsv';

const JSON_EXAMPLE = `{
  "message": "Bring a card",
  "budget": 30,
  "currency": "AUD",
  "eventDate": "2026-12-20",
  "participants": [
    {
      "name": "Sam",
      "hint": "likes tea",
      "email": "sam@example.com",
      "mustGiveTo": "Alex",
      "mustNotGiveTo": ["Jo"]
    },
    "Alex",
    "Jo"
  ]
}`;

interface PowerUserPanelProps {
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
  onImport: (participants: Record<string, Participant>, settings: ImportedSettings) => void;
}

// Text editing and file imports, tucked away below the main card for people who want them.
export function PowerUserPanel({ participants, onChangeParticipants, onImport }: PowerUserPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-caption text-muted transition-colors hover:text-pine sm:px-6"
      >
        <Code size={16} weight="bold" className="flex-none" aria-hidden />
        <span className="flex-1">
          <span className="font-medium">{t('power.toggle')}</span>
          <span className="text-faint"> · {t('power.toggleHint')}</span>
        </span>
        <CaretDown size={14} weight="bold" className={`flex-none transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {isOpen && (
        <div id={panelId} className="space-y-6 px-5 pb-6 sm:px-6">
          <section className="space-y-3">
            <h3 className="section-label">{t('power.textTitle')}</h3>
            <ParticipantsTextView participants={participants} onChangeParticipants={onChangeParticipants} />
          </section>

          <section className="space-y-3">
            <h3 className="section-label">{t('power.importTitle')}</h3>
            <p className="text-caption text-muted">{t('power.importHelp')}</p>
            <ImportHistory currentParticipantCount={Object.keys(participants).length} onImport={onImport} />
            <details className="text-caption text-muted">
              <summary className="cursor-pointer font-medium text-pine">{t('power.jsonSummary')}</summary>
              <p className="mt-2">{t('power.jsonHelp')}</p>
              <pre className="code-block mt-2">{JSON_EXAMPLE}</pre>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
