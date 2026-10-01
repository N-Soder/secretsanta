import { SlidersHorizontal, X } from "@phosphor-icons/react";
import { Participant } from '../types';
import { useTranslation } from 'react-i18next';

const AVATAR_COLOURS = [
  'bg-pine-soft text-pine',
  'bg-cranberry-soft text-cranberry',
  'bg-gold-soft text-gold-ink',
];

interface ParticipantRowProps {
  participant: Participant;
  participantIndex: number;
  isLast: boolean;
  onNameChange: (name: string) => void;
  onOpenRules: () => void;
  onRemove: () => void;
}

export function ParticipantRow({
  participant,
  participantIndex,
  isLast,
  onNameChange,
  onOpenRules,
  onRemove,
}: ParticipantRowProps) {
  const { t } = useTranslation();
  const initial = participant.name.trim().charAt(0).toUpperCase();

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border py-1.5 pl-2 pr-1.5 transition-colors focus-within:border-gold ${
      isLast ? 'border-dashed border-line-strong' : 'border-line bg-white'
    }`}>
      <span
        aria-hidden
        className={`grid flex-none place-items-center w-8 h-8 rounded-full text-caption font-bold ${
          isLast ? 'border-[1.5px] border-dashed border-line-strong text-faint' : AVATAR_COLOURS[participantIndex % AVATAR_COLOURS.length]
        }`}
      >
        {isLast ? '+' : initial}
      </span>

      <input
        type="text"
        value={participant.name}
        onChange={(e) => onNameChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent py-1.5 text-base sm:text-ui font-medium text-ink placeholder:font-normal placeholder:text-faint focus:outline-none"
        placeholder={t('participants.enterName')}
        aria-label={isLast ? t('participants.enterName') : undefined}
        tabIndex={participantIndex + 1}
        autoFocus={isLast && document.activeElement?.tagName !== 'INPUT' && window.innerWidth >= 768}
      />

      {!isLast && (
        <>
          {participant.rules.length > 0 && (
            <span className="chip">
              {t('participants.rulesCount', { count: participant.rules.length })}
            </span>
          )}
          {participant.hint && (
            <span className="hidden sm:inline chip">
              {t('participants.hintChip')}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenRules}
            className="grid flex-none place-items-center w-[34px] h-[34px] rounded-icon text-muted transition-colors hover:bg-ivory hover:text-pine"
            title={t('participants.editRules')}
            aria-label={`${t('participants.editRules')}: ${participant.name}`}
          >
            <SlidersHorizontal size={18} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="grid flex-none place-items-center w-[34px] h-[34px] rounded-icon text-muted transition-colors hover:bg-cranberry-soft hover:text-cranberry"
            title={t('participants.removeParticipant')}
            aria-label={`${t('participants.removeParticipant')}: ${participant.name}`}
          >
            <X size={16} weight="bold" />
          </button>
        </>
      )}
    </div>
  );
}
