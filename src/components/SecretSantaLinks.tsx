import React, { useState } from "react";
import { DownloadSimple, Warning } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "./CopyButton";
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
    {hasChanged && (
      <div className="mb-2 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
        <p className="text-sm">
          {t('links.warningParticipantsChanged')}
        </p>
        <button
          className="mt-2 w-full px-2 py-1 bg-yellow-700/40 rounded hover:bg-yellow-700/50 text-center text-white text-xs"
          onClick={onGeneratePairs}
        >
          {t('links.resetAssignments')}
        </button>
      </div>
    )}
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-gray-600 text-balance mb-4">
        {t('links.shareInstructions')}
      </p>
      <div className="grid grid-cols-[minmax(100px,auto)_1fr] gap-3">
        {adjustedPairings.map(([giver, receiver, hint]) => (
          <React.Fragment key={giver}>
            <span className="font-medium self-center">
              {giver}:
            </span>
            <CopyButton
              textToCopy={() => generateAssignmentLink(giver, receiver, hint, instructions)}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              {t('links.copySecretLink')}
            </CopyButton>
          </React.Fragment>
        ))}
      </div>
    </div>
    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <h3 className="text-lg text-gray-800">
        {t('history.exportTitle')}
      </h3>
      <p className="text-sm text-gray-600">
        {t('history.exportHelp')}
      </p>
      <p className="flex gap-2 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-sm">
        <Warning size={20} weight="bold" className="flex-none" aria-hidden />
        <span>{t('history.exportWarning')}</span>
      </p>
      {hasChanged && (
        <p className="text-sm text-gray-600">
          {t('history.exportStale')}
        </p>
      )}
      <button
        onClick={handleExportHistory}
        disabled={hasChanged || isExporting}
        className={`w-full p-2 text-white rounded flex items-center justify-center gap-2 ${
          hasChanged || isExporting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
        }`}
      >
        <DownloadSimple size={20} weight="bold" />
        {isExporting ? t('history.exportPreparing') : t('history.exportButton')}
      </button>
    </div>
  </>;
}