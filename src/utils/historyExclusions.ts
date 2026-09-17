import { Participant } from '../types';
import { checkRules } from './generatePairs';
import { findMaximumMatching } from './matching';

export interface PastPairing { giverId: string; receiverId: string; }

export interface ExclusionResult {
  participants: Record<string, Participant>; // new object; input not mutated
  added: number;                              // mustNot rules actually added
  skipped: number;                            // past pairings not applied (see below)
}

function cloneParticipants(participants: Record<string, Participant>): Record<string, Participant> {
  const clone: Record<string, Participant> = {};
  for (const [id, participant] of Object.entries(participants)) {
    clone[id] = { ...participant, rules: participant.rules.map(rule => ({ ...rule })) };
  }
  return clone;
}

export function applyPastPairingExclusions(
  participants: Record<string, Participant>,
  pastPairings: PastPairing[],
): ExclusionResult {
  const result = cloneParticipants(participants);
  const seenPairings = new Set<string>();
  let added = 0;
  let skipped = 0;

  for (const { giverId, receiverId } of pastPairings) {
    const pairingKey = `${giverId}\u0000${receiverId}`;

    if (seenPairings.has(pairingKey)) {
      skipped++;
      continue;
    }
    seenPairings.add(pairingKey);

    const giver = result[giverId];
    const receiver = result[receiverId];

    if (!giver || !receiver || giverId === receiverId) {
      skipped++;
      continue;
    }

    if (giver.rules.some(rule => rule.type === 'mustNot' && rule.targetParticipantId === receiverId)) {
      skipped++;
      continue;
    }

    // The organiser's forced pairing wins; adding a mustNot here would
    // conflict with it.
    if (giver.rules.some(rule => rule.type === 'must')) {
      skipped++;
      continue;
    }

    giver.rules.push({ type: 'mustNot', targetParticipantId: receiverId, origin: 'history' });
    added++;
  }

  return { participants: result, added, skipped };
}

export function removeHistoryExclusions(
  participants: Record<string, Participant>,
): Record<string, Participant> {
  const result = cloneParticipants(participants);
  for (const participant of Object.values(result)) {
    participant.rules = participant.rules.filter(rule => rule.origin !== 'history');
  }
  return result;
}

export function countHistoryExclusions(participants: Record<string, Participant>): number {
  return Object.values(participants).reduce(
    (count, participant) => count + participant.rules.filter(rule => rule.origin === 'history').length,
    0,
  );
}

export type DrawFeasibility =
  | { feasible: true }
  | { feasible: false; stuckGiverIds: string[]; historyExclusionsInvolved: boolean };

// Builds each giver's candidate receiver set exactly as generatePairs does:
// all other participants, narrowed to a single must target when present,
// otherwise with mustNot targets removed. Rules pointing at an unknown
// participant are ignored.
function buildCandidateReceivers(participants: Record<string, Participant>): Map<string, Set<string>> {
  const participantIds = Object.keys(participants);
  const candidateReceivers = new Map<string, Set<string>>();

  for (const giverId of participantIds) {
    const giver = participants[giverId];
    const candidates = new Set(participantIds.filter(id => id !== giverId));

    const mustRule = giver.rules.find(rule => rule.type === 'must' && participants[rule.targetParticipantId]);
    if (mustRule) {
      candidates.clear();
      candidates.add(mustRule.targetParticipantId);
    } else {
      giver.rules
        .filter(rule => rule.type === 'mustNot' && participants[rule.targetParticipantId])
        .forEach(rule => candidates.delete(rule.targetParticipantId));
    }

    candidateReceivers.set(giverId, candidates);
  }

  return candidateReceivers;
}

// Plain feasibility check (no diagnostics), used both directly and to test
// the "without history exclusions" hypothetical without risking recursion.
function isFeasible(participants: Record<string, Participant>): boolean {
  const participantIds = Object.keys(participants);

  if (participantIds.length < 2) {
    return false;
  }

  if (participantIds.some(id => checkRules(participants[id].rules) !== null)) {
    return false;
  }

  const candidateReceivers = buildCandidateReceivers(participants);
  const matching = findMaximumMatching(participantIds, candidateReceivers);
  return matching.size === participantIds.length;
}

export function checkDrawFeasibility(participants: Record<string, Participant>): DrawFeasibility {
  const participantIds = Object.keys(participants);

  if (participantIds.length < 2) {
    return { feasible: false, stuckGiverIds: [], historyExclusionsInvolved: false };
  }

  const ruleErrorIds = participantIds.filter(id => checkRules(participants[id].rules) !== null);
  if (ruleErrorIds.length > 0) {
    const stuckGiverIds = [...ruleErrorIds].sort((a, b) =>
      participants[a].name.localeCompare(participants[b].name)
    );
    return { feasible: false, stuckGiverIds, historyExclusionsInvolved: false };
  }

  const candidateReceivers = buildCandidateReceivers(participants);
  const matching = findMaximumMatching(participantIds, candidateReceivers);

  if (matching.size === participantIds.length) {
    return { feasible: true };
  }

  const stuckGiverIds = participantIds
    .filter(id => !matching.has(id))
    .sort((a, b) => participants[a].name.localeCompare(participants[b].name));

  const historyExclusionsInvolved = isFeasible(removeHistoryExclusions(participants));

  return { feasible: false, stuckGiverIds, historyExclusionsInvolved };
}
