import { useTranslation } from 'react-i18next';

interface SettingsProps {
  instructions: string;
  onChangeInstructions: (instructions: string) => void;
  autoFocus?: boolean;
}

export function Settings({ instructions, onChangeInstructions, autoFocus }: SettingsProps) {
  const { t } = useTranslation();

  return (
    <div>
      <label htmlFor="instructions" className="block mb-2 text-sm font-bold text-pine">
        {t('settings.instructions')} <span className="font-normal text-muted">{t('settings.optional')}</span>
      </label>
      <textarea
        id="instructions"
        value={instructions}
        onChange={(e) => onChangeInstructions(e.target.value)}
        className="field min-h-[96px] leading-relaxed resize-y"
        autoFocus={autoFocus}
        placeholder={t('settings.instructionsPlaceholder')}
        aria-describedby="instructions-help"
      />
      <p id="instructions-help" className="mt-2 text-[13px] leading-normal text-muted">
        {t('settings.instructionsHelp')}
      </p>
    </div>
  );
}
