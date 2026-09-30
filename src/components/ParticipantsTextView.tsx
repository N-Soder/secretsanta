import { Participant } from '../types';
import { useState } from 'react';
import { parseParticipantsText, ParseError, formatParticipantText } from '../utils/parseParticipants';
import { useTranslation } from 'react-i18next';

interface ParticipantsTextViewProps {
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
}

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
      />

      {error && (
        <div role="alert" className="notice-error">
          {t('errors.line', { number: error.line })}: {t(error.key as any, error.values)}
        </div>
      )}
    </div>
  );
} 