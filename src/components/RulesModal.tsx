import { useState } from "react";
import { X, Link, LinkBreak } from "@phosphor-icons/react";
import { Participant, Rule } from '../types';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { LIMITS } from '../api/limits';
import { produce } from "immer";

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  participantId: string;
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
}

export function RulesModal({
  isOpen,
  onClose,
  participantId,
  participants,
  onChangeParticipants,
}: RulesModalProps) {
  const { t } = useTranslation();
  const participant = participants[participantId];
  const [localRules, setLocalRules] = useState<Rule[]>(participant.rules);
  const [localHint, setLocalHint] = useState<string>(participant.hint || '');

  const addRule = (type: 'must' | 'mustNot') => {
    setLocalRules([...localRules, { type, targetParticipantId: '' }]);
  };

  const updateRule = (index: number, targetParticipantId: string) => {
    const newRules = [...localRules];
    newRules[index] = { ...newRules[index], targetParticipantId };
    setLocalRules(newRules);
  };

  const removeRule = (index: number) => {
    setLocalRules(localRules.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onChangeParticipants(produce(participants, draft => {
      draft[participantId].rules = localRules;
      draft[participantId].hint = localHint || undefined;
    }));
    onClose();
  };

  const hasMustRule = localRules.some(rule => rule.type === 'must');
  const hasMustNotRule = localRules.some(rule => rule.type === 'mustNot');

  if (!isOpen)
      return null;

  return (
    <Modal labelledBy="rules-title" onClose={onClose}>
        <h2 id="rules-title" className="text-title text-pine mb-5">
          {t('rules.title', { name: participant.name })}
        </h2>
        
        <div className="mb-6">
          <label htmlFor="rules-hint" className="block text-ui font-bold text-pine mb-2">
            {t('rules.hintLabel')}
          </label>
          <input
            id="rules-hint"
            maxLength={LIMITS.hint}
            type="text"
            value={localHint}
            onChange={(e) => setLocalHint(e.target.value)}
            placeholder={t('rules.hintPlaceholder')}
            className="field"
          />
        </div>
        
        <div className="space-y-3 mb-6">
          {localRules.map((rule, index) => (
            <div key={index} className="flex flex-wrap sm:flex-nowrap gap-2 items-center text-ui text-body">
              <span className="w-full sm:w-auto font-bold text-pine">
                {rule.type === 'must' 
                  ? t('rules.mustBePairedWith')
                  : t('rules.mustNotBePairedWith')
                }
              </span>
              <select
                aria-label={`${rule.type === 'must' ? t('rules.mustBePairedWith') : t('rules.mustNotBePairedWith')} ${index + 1}`}
                value={rule.targetParticipantId}
                onChange={(e) => updateRule(index, e.target.value)}
                className="field flex-1 w-auto min-w-0"
              >
                <option value="">{t('rules.selectParticipant')}</option>
                {Object.values(participants)
                  .filter(p => p.id !== participantId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                }
              </select>
              {rule.origin === 'history' && (
                <span className="chip">
                  {t('history.ruleFromPastDraw')}
                </span>
              )}
              <button
                onClick={() => removeRule(index)}
                type="button"
                className="grid place-items-center w-9 h-9 rounded-icon text-muted hover:bg-cranberry-soft hover:text-cranberry"
                aria-label={t('rules.removeRule')}
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <button
            type="button"
            onClick={() => addRule('must')}
            disabled={hasMustNotRule}
            className="btn-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line"
          >
            <Link size={18} />
            {t('rules.addMustRule')}
          </button>
          <button
            type="button"
            onClick={() => addRule('mustNot')}
            disabled={hasMustRule}
            className="btn-secondary flex-1 text-cranberry disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line"
          >
            <LinkBreak size={18} />
            {t('rules.addMustNotRule')}
          </button>
        </div>

        <div className="flex justify-end items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-quiet"
          >
            {t('rules.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary w-auto"
          >
            {t('rules.saveRules')}
          </button>
        </div>
    </Modal>
  );
} 