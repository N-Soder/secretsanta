import { produce } from 'immer';
import { Participant, Rule } from '../types';

type People = Record<string, Participant>;

// How "target won't get owner" stands today:
// - 'done': already true (a matching rule, or target is forced to someone else)
// - 'blocked': target is forced to get owner, so it can't be added
// - 'open': can be added
export type ReverseState = 'done' | 'blocked' | 'open';

export function reverseState(people: People, ownerId: string, targetId: string): ReverseState {
  const rules = people[targetId]?.rules ?? [];
  const must = rules.find(rule => rule.type === 'must');
  if (must) return must.targetParticipantId === ownerId ? 'blocked' : 'done';
  return rules.some(rule => rule.type === 'mustNot' && rule.targetParticipantId === ownerId) ? 'done' : 'open';
}

// Saves one person's rules and hint, and adds "won't get owner" to each
// person in bothWays where that is still open.
export function saveRules(people: People, ownerId: string, rules: Rule[], hint: string, bothWays: string[]): People {
  return produce(people, draft => {
    draft[ownerId].rules = rules;
    draft[ownerId].hint = hint || undefined;
    for (const targetId of new Set(bothWays)) {
      if (targetId === ownerId || !draft[targetId]) continue;
      if (!rules.some(rule => rule.type === 'mustNot' && rule.targetParticipantId === targetId)) continue;
      if (reverseState(draft, ownerId, targetId) !== 'open') continue;
      draft[targetId].rules.push({ type: 'mustNot', targetParticipantId: ownerId });
    }
  });
}
