import { useTranslation } from 'react-i18next';
import { Participant } from '../types';
import { DrawFeasibility } from '../utils/historyExclusions';

interface DrawBlockedNoticeProps {
  problem: Extract<DrawFeasibility, { feasible: false }>;
  participants: Record<string, Participant>;
  historyExclusionCount: number;
  onRemoveHistoryExclusions: () => void;
  onDismiss: () => void;
}

export function DrawBlockedNotice({
  problem,
  participants,
  historyExclusionCount,
  onRemoveHistoryExclusions,
  onDismiss,
}: DrawBlockedNoticeProps) {
  const { t } = useTranslation();

  const names = problem.stuckGiverIds
    .map(id => participants[id]?.name)
    .filter((name): name is string => !!name);

  const nameList = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names.join('');

  return (
    <div role="alert" className="p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-sm space-y-2">
      <p>
        {names.length > 0
          ? t('history.drawBlocked', { count: names.length, names: nameList })
          : t('history.drawBlockedGeneric')}
      </p>

      {problem.historyExclusionsInvolved && (
        <p>{t('history.drawBlockedHistory')}</p>
      )}

      <div className="flex gap-2">
        {problem.historyExclusionsInvolved && historyExclusionCount > 0 && (
          <button
            type="button"
            onClick={onRemoveHistoryExclusions}
            className="flex-1 px-2 py-1 bg-yellow-700/40 rounded hover:bg-yellow-700/50 text-white text-xs"
          >
            {t('history.removeAllExclusions', { count: historyExclusionCount })}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1 text-xs underline"
        >
          {t('history.dismiss')}
        </button>
      </div>
    </div>
  );
}
