import { useTranslation } from 'react-i18next';

interface SettingsProps {
  instructions: string;
  onChangeInstructions: (instructions: string) => void;
}

export function Settings({ instructions, onChangeInstructions }: SettingsProps) {
  const { t } = useTranslation();

  return (
    <div>
      <label htmlFor="instructions" className="sr-only">{t('settings.instructions')}</label>
      <textarea
        id="instructions"
        value={instructions}
        onChange={(e) => onChangeInstructions(e.target.value)}
        className="field min-h-[140px] leading-relaxed resize-y"
        placeholder={t('settings.instructionsPlaceholder')}
        aria-describedby="instructions-help"
      />
      <p id="instructions-help" className="mt-2 text-[13px] leading-normal text-muted">
        {t('settings.instructionsHelp')}
      </p>
    </div>
  );
}
