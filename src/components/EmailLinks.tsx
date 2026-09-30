import { useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { generateAssignmentLink } from "../utils/links";
import { sendLinkEmails } from "../utils/emailLinks";

export interface EmailablePairing {
  giverId: string;
  giver: string;
  receiver: string;
  hint?: string;
}

interface EmailLinksProps {
  pairings: EmailablePairing[];
  instructions?: string;
  disabled: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; count: number }
  | { kind: 'failed'; error?: string };

export function EmailLinks({ pairings, instructions, disabled }: EmailLinksProps) {
  const { t } = useTranslation();
  // Keyed by participant ID so addresses survive a redraw.
  const [emails, setEmails] = useLocalStorage<Record<string, string>>('secretSantaEmails', {});
  const [organiserName, setOrganiserName] = useLocalStorage<string>('secretSantaOrganiserName', '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const recipients = pairings.filter(p => emails[p.giverId]?.trim());

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ kind: 'sending' });

    const messages = await Promise.all(recipients.map(async p => ({
      to: emails[p.giverId].trim(),
      giverName: p.giver,
      link: await generateAssignmentLink(p.giver, p.receiver, p.hint, instructions),
    })));

    const result = await sendLinkEmails({ organiserName: organiserName.trim() || undefined, messages });
    setStatus(result.ok
      ? { kind: 'sent', count: result.sent }
      : { kind: 'failed', error: result.error });
  };

  return (
    <form className="space-y-3" onSubmit={handleSend}>
      <h3 className="text-[22px] text-pine">
        {t('email.title')}
      </h3>
      <p className="text-[13px] leading-normal text-muted">
        {t('email.help')}
      </p>

      <div className="grid gap-2">
        {pairings.map(p => (
          <label key={p.giverId} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3">
            <span className="truncate text-[15px] font-medium">{p.giver}</span>
            <input
              type="email"
              autoComplete="off"
              value={emails[p.giverId] ?? ''}
              onChange={e => {
                setEmails({ ...emails, [p.giverId]: e.target.value });
                setStatus({ kind: 'idle' });
              }}
              className="field py-2 text-base sm:text-[15px]"
              placeholder={t('email.addressPlaceholder')}
              aria-label={t('email.addressLabel', { name: p.giver })}
            />
          </label>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-pine">{t('email.organiserLabel')}</span>
        <input
          type="text"
          maxLength={80}
          value={organiserName}
          onChange={e => setOrganiserName(e.target.value)}
          className="field py-2 text-base sm:text-[15px]"
          placeholder={t('email.organiserPlaceholder')}
        />
      </label>

      <p className="text-[13px] leading-normal text-muted">
        {t('email.privacy')}
      </p>

      {status.kind === 'sent' && (
        <p role="status" className="notice">{t('email.sent', { count: status.count })}</p>
      )}
      {status.kind === 'failed' && (
        <p role="alert" className="notice-error">{status.error ?? t('email.failed')}</p>
      )}

      <button
        type="submit"
        disabled={disabled || recipients.length === 0 || status.kind === 'sending'}
        className="btn-primary"
      >
        <EnvelopeSimple size={18} weight="bold" />
        {status.kind === 'sending'
          ? t('email.sending')
          : t('email.send', { count: recipients.length })}
      </button>
    </form>
  );
}
