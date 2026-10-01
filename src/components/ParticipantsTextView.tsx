import { Participant } from '../types';
import { useState } from 'react';
import { parseParticipantsText, ParseError, formatParticipantText } from '../utils/parseParticipants';
import { Trans, useTranslation } from 'react-i18next';

interface ParticipantsTextViewProps {
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
}

const JSON_EXAMPLE = `{
  "message": "Budget is $30",
  "participants": [
    { "name": "Sam", "hint": "likes tea", "mustGiveTo": "Alex" },
    { "name": "Alex", "mustNotGiveTo": ["Jo"] },
    { "name": "Jo" }
  ]
}`;

export function ParticipantsTextView({ participants, onChangeParticipants }: ParticipantsTextViewProps) {
  const { t } = useTranslation();

  const [text, setText] = useState(() => formatParticipantText(participants));
  const [error, setError] = useState<ParseError | null>(null);

  const handleChange = (newText: string) => {
    setText(newText);
    
    const result = parseParticipantsText(newText, participants);
    if (result.ok) {
      setError(null);
      onChangeParticipants(result.participants);
    } else {
      setError(result);
    }
  };

  return (
    <div className="relative space-y-3">
      <textarea
        aria-label={t('participants.title')}
        className={`field block h-56 font-mono text-base sm:text-sm text-nowrap ${
          error ? 'border-cranberry focus:border-cranberry' : ''
        }`}
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={t('participants.textPlaceholder')}
        aria-describedby="participants-text-help"
      />

      <p id="participants-text-help" className="text-[13px] leading-normal text-muted">
        <Trans i18nKey="participants.textHelp" components={{ code: <code className="rounded bg-ivory px-1 font-mono text-pine"/> }}/>
      </p>

      {error && (
        <div role="alert" className="notice-error">
          {t('errors.line', { number: error.line })}: {t(error.key as any, error.values)}
        </div>
      )}

      <details className="text-[13px] text-muted">
        <summary className="cursor-pointer text-pine">{t('participants.jsonHelpSummary')}</summary>
        <p className="mt-2">{t('participants.jsonHelp')}</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-ivory p-3 font-mono text-xs text-ink">{JSON_EXAMPLE}</pre>
      </details>
    </div>
  );
} 