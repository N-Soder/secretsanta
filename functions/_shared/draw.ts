import type { ParticipantInput } from '../../src/api/types';
import type { Participant } from '../../src/types';
import { generatePairs } from '../../src/utils/generatePairs';
import { checkDrawFeasibility } from '../../src/utils/historyExclusions';

export type DrawOutcome = { ok: true; pairs: Map<string, string> } | { ok: false; stuckGiverIds: string[] };

export function drawPairs(people: ParticipantInput[]): DrawOutcome {
  const participants: Record<string, Participant> = Object.fromEntries(
    people.map(({ id, name, hint, rules }) => [id, { id, name, hint, rules }]),
  );

  const generated = generatePairs(participants);
  if (generated) {
    return { ok: true, pairs: new Map(generated.pairings.map(({ giver, receiver }) => [giver.id, receiver.id])) };
  }

  const feasibility = checkDrawFeasibility(participants);
  return { ok: false, stuckGiverIds: feasibility.feasible ? [] : feasibility.stuckGiverIds };
}
