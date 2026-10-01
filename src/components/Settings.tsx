import { useTranslation } from 'react-i18next';

interface SettingsProps {
  instructions: string;
  onChangeInstructions: (instructions: string) => void;
  autoFocus?: boolean;
  inputRef?: (element: HTMLTextAreaElement | null) => void;
}

export function Settings({ instructions, onChangeInstructions, autoFocus, inputRef }: SettingsProps) {
  const { t } = useTranslation();

  return (
    <div>
      <label htmlFor="instructions" className="block mb-2 text-ui font-bold text-pine">
        {t('settings.instructions')}
      </label>
      <textarea
        id="instructions"
        ref={inputRef}
        value={instructions}
        onChange={(e) => onChangeInstructions(e.target.value)}
        className="field min-h-[96px] leading-relaxed resize-y"
        autoFocus={autoFocus}
        placeholder={t('settings.instructionsPlaceholder')}
        aria-describedby="instructions-help"
      />
      <p id="instructions-help" className="mt-2 text-caption text-muted">
        {t('settings.instructionsHelp')}
      </p>
    </div>
  );
}
