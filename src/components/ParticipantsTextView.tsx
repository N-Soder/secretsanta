import { Participant } from '../types';
import { useEffect, useRef, useState } from 'react';
import { parseParticipantsText, ParseError, formatParticipantText } from '../utils/parseParticipants';
import { Trans, useTranslation } from 'react-i18next';

interface ParticipantsTextViewProps {
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
}

export function ParticipantsTextView({ participants, onChangeParticipants }: ParticipantsTextViewProps) {
  const { t } = useTranslation();

  const [text, setText] = useState(() => formatParticipantText(participants));
  const [error, setError] = useState<ParseError | null>(null);
  // The list above stays editable, so pick up its changes without clobbering our own edits.
  const lastEmitted = useRef(participants);

  useEffect(() => {
    if (participants === lastEmitted.current) return;
    lastEmitted.current = participants;
    setText(formatParticipantText(participants));
    setError(null);
  }, [participants]);

  const handleChange = (newText: string) => {
    setText(newText);
    
    const result = parseParticipantsText(newText, participants);
    if (result.ok) {
      setError(null);
      lastEmitted.current = result.participants;
      onChangeParticipants(result.participants);
    } else {
      setError(result);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        aria-label={t('power.textTitle')}
        className={`field block h-40 font-mono text-nowrap ${
          error ? 'border-cranberry focus:border-cranberry' : ''
        }`}
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={t('power.textPlaceholder')}
        aria-describedby="participants-text-help"
        spellCheck={false}
      />

      {error && (
        <div role="alert" className="notice-error">
          {t('errors.line', { number: error.line })}: {t(error.key as any, error.values)}
        </div>
      )}

      <p id="participants-text-help" className="text-caption text-muted">
        <Trans i18nKey="power.textHelp" components={{ code: <code className="code-inline"/> }}/>
      </p>
    </div>
  );
}
