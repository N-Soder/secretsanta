import { useState } from "react";
import { ArrowsClockwise, DownloadSimple, Warning } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "./CopyButton";
import { EmailLinks } from "./EmailLinks";
import { generateAssignmentLink } from "../utils/links";
import { serialiseHistoryCsv } from "../utils/historyCsv";
import { Participant } from "../types";
import { GeneratedPairs, generateGenerationHash } from "../utils/generatePairs";

interface SecretSantaLinksProps {
  assignments: GeneratedPairs;
  instructions?: string;
  participants: Record<string, Participant>;
  onGeneratePairs: () => void;
}

export function SecretSantaLinks({ assignments, instructions, participants, onGeneratePairs }: SecretSantaLinksProps) {
  const { t } = useTranslation();

  const currentHash = generateGenerationHash(participants);
  const hasChanged = currentHash !== assignments.hash;

  const adjustedPairings = assignments.pairings.map(({giver, receiver}): [string, string, string | undefined] => [
    participants[giver.id]?.name ?? giver.name,
    participants[receiver.id]?.name ?? receiver.name,
    participants[receiver.id]?.hint,
  ]);

  adjustedPairings.sort((a, b) => {
    return a[0].localeCompare(b[0]);
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExportHistory = async () => {
    setIsExporting(true);
    try {
      const links: Record<string, string> = {};
      await Promise.all(assignments.pairings.map(async ({giver, receiver}) => {
        links[giver.id] = await generateAssignmentLink(
          participants[giver.id]?.name ?? giver.name,
          participants[receiver.id]?.name ?? receiver.name,
          participants[receiver.id]?.hint,
          instructions,
        );
      }));

      const exportedAt = new Date();
      const csvContent = serialiseHistoryCsv({
        participants,
        assignments,
        instructions: instructions ?? '',
        links,
        exportedAt,
      });

      // Local calendar date, so an export late on 24 December isn't named for the 23rd.
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStamp = `${exportedAt.getFullYear()}-${pad(exportedAt.getMonth() + 1)}-${pad(exportedAt.getDate())}`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `secret-santa-history-${dateStamp}.csv`;
      a.click();

      setTimeout(() => window.URL.revokeObjectURL(url), 0);
    } finally {
      setIsExporting(false);
    }
  };

  return <>
    <p className="text-[13px] text-muted">
      {t('links.shareInstructions')}
    </p>

    {hasChanged && (
      <div role="status" className="notice mt-4">
        <p>{t('links.warningParticipantsChanged')}</p>
        <button type="button" className="btn-secondary mt-3" onClick={onGeneratePairs}>
          <ArrowsClockwise size={16} weight="bold" />
          {t('links.resetAssignments')}
        </button>
      </div>
    )}

    <ul className="mt-4 grid gap-2">
      {adjustedPairings.map(([giver, receiver, hint]) => (
        <li key={giver} className="flex items-center gap-3 rounded-xl bg-ivory py-2.5 pl-3.5 pr-2.5">
          <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{giver}</span>
          <CopyButton
            textToCopy={() => generateAssignmentLink(giver, receiver, hint, instructions)}
            className="btn-secondary flex-none min-w-[118px]"
          >
            {t('links.copySecretLink')}
          </CopyButton>
        </li>
      ))}
    </ul>

    <hr className="my-6 border-line" />

    <EmailLinks
      pairings={assignments.pairings
        .map(({giver, receiver}) => ({
          giverId: giver.id,
          giver: participants[giver.id]?.name ?? giver.name,
          receiver: participants[receiver.id]?.name ?? receiver.name,
          hint: participants[receiver.id]?.hint,
        }))
        .sort((a, b) => a.giver.localeCompare(b.giver))}
      instructions={instructions}
      disabled={hasChanged}
    />

    <hr className="my-6 border-line" />

    <div className="space-y-3">
      <h3 className="text-[22px] text-pine">
        {t('history.exportTitle')}
      </h3>
      <p className="text-[13px] leading-normal text-muted">
        {t('history.exportHelp')}
      </p>
      <p className="notice flex gap-2.5">
        <Warning size={18} weight="bold" className="flex-none mt-0.5" aria-hidden />
        <span>{t('history.exportWarning')}</span>
      </p>
      {hasChanged && (
        <p className="text-[13px] text-muted">
          {t('history.exportStale')}
        </p>
      )}
      <button
        type="button"
        onClick={handleExportHistory}
        disabled={hasChanged || isExporting}
        className="btn-primary"
      >
        <DownloadSimple size={18} weight="bold" />
        {isExporting ? t('history.exportPreparing') : t('history.exportButton')}
      </button>
    </div>
  </>;
}
