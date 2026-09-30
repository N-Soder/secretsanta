import { useEffect, useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Participant } from '../types';
import { HistoryImport, HistoryParseError, parseHistoryCsv } from '../utils/historyCsv';
import { applyPastPairingExclusions } from '../utils/historyExclusions';

// A generous ceiling: a history CSV is roughly 300 bytes per participant.
const MAX_FILE_BYTES = 1024 * 1024;

interface ImportHistoryProps {
  currentParticipantCount: number;
  onImport: (participants: Record<string, Participant>, instructions: string) => void;
}

type ImportState =
  | { status: 'idle' }
  | { status: 'failed'; errors: HistoryParseError[]; message?: string }
  | { status: 'ready'; data: HistoryImport };

export function ImportHistory({ currentParticipantCount, onImport }: ImportHistoryProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const [avoidRepeats, setAvoidRepeats] = useState(true);

  const close = () => setState({ status: 'idle' });

  useEffect(() => {
    if (state.status === 'idle') return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state.status]);

  const handleFile = async (file: File | undefined) => {
    // Reset the input so choosing the same file again still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setState({ status: 'failed', errors: [], message: t('history.importTooLarge') });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setState({ status: 'failed', errors: [], message: t('history.importUnreadable') });
      return;
    }

    const result = parseHistoryCsv(text);
    if (result.ok) {
      setAvoidRepeats(result.data.pastPairings.length > 0);
      setState({ status: 'ready', data: result.data });
    } else {
      setState({ status: 'failed', errors: result.errors });
    }
  };

  const handleConfirm = () => {
    if (state.status !== 'ready') return;

    const { data } = state;
    const participants = avoidRepeats
      ? applyPastPairingExclusions(data.participants, data.pastPairings).participants
      : data.participants;

    onImport(participants, data.instructions);
    close();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={e => handleFile(e.target.files?.[0])}
    />
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="w-full p-2 border border-dashed rounded text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 text-sm"
    >
      <UploadSimple size={18} weight="bold" />
      {t('history.importButton')}
    </button>

    {state.status !== 'idle' && (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={close}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-history-title"
          className="bg-white rounded-lg p-6 max-w-xl w-full max-h-full overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <h2 id="import-history-title" className="text-xl font-bold mb-4">
            {state.status === 'failed' ? t('history.importFailed') : t('history.importTitle')}
          </h2>

          {state.status === 'failed' && (
            <div className="bg-red-100 text-red-700 text-sm p-3 rounded mb-6 space-y-1">
              {state.message && <p>{state.message}</p>}
              {state.errors.map((error, index) => (
                <p key={index}>
                  {error.line !== null && error.key !== 'missingColumns' && <>{t('history.importLine', { number: error.line })}: </>}
                  {t(`history.importErrors.${error.key}`, error.params)}
                </p>
              ))}
            </div>
          )}

          {state.status === 'ready' && (() => {
            const count = Object.keys(state.data.participants).length;
            const date = formatDate(state.data.exportedAt);
            const pairingCount = state.data.pastPairings.length;

            return (
              <div className="space-y-4 mb-6 text-sm text-gray-700">
                <p className="text-base">
                  {date
                    ? t('history.importSummary', { count, date })
                    : t('history.importSummaryUndated', { count })}
                </p>

                {currentParticipantCount > 0 && (
                  <p className="p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
                    {t('history.importReplaceWarning', { count: currentParticipantCount })}
                  </p>
                )}

                {pairingCount > 0 ? (
                  <label className="flex gap-3 items-start p-3 bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={avoidRepeats}
                      onChange={e => setAvoidRepeats(e.target.checked)}
                    />
                    <span>
                      <span className="block font-medium">{t('history.importExcludeLabel')}</span>
                      <span className="block text-xs text-gray-500 mt-1">
                        {t('history.importExcludeHelp', { count: pairingCount })}
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="text-gray-500">{t('history.importNoPairings')}</p>
                )}

                <p className="text-xs text-gray-500">{t('history.importLinksNote')}</p>
                <p className="text-xs text-gray-500">{t('history.importPrivacy')}</p>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2">
            <button
              onClick={close}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              {state.status === 'failed' ? t('history.importClose') : t('history.importCancel')}
            </button>
            {state.status === 'ready' && (
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                {t('history.importConfirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
  </>;
}
