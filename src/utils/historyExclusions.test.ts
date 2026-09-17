import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Participant, Rule } from '../types';
import { generatePairs } from './generatePairs';
import {
  applyPastPairingExclusions,
  removeHistoryExclusions,
  countHistoryExclusions,
  checkDrawFeasibility,
  PastPairing,
} from './historyExclusions';

function makeParticipants(ids: string[]): Record<string, Participant> {
  const participants: Record<string, Participant> = {};
  for (const id of ids) {
    participants[id] = { id, name: id, rules: [] };
  }
  return participants;
}

describe('applyPastPairingExclusions', () => {
  it('adds a history mustNot rule for each valid past pairing', () => {
    const participants = makeParticipants(['A', 'B', 'C']);
    const pastPairings: PastPairing[] = [
      { giverId: 'A', receiverId: 'B' },
      { giverId: 'B', receiverId: 'C' },
    ];

    const result = applyPastPairingExclusions(participants, pastPairings);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.participants['A'].rules).toEqual([
      { type: 'mustNot', targetParticipantId: 'B', origin: 'history' },
    ]);
    expect(result.participants['B'].rules).toEqual([
      { type: 'mustNot', targetParticipantId: 'C', origin: 'history' },
    ]);
  });

  it('does not mutate the input participants', () => {
    const participants = makeParticipants(['A', 'B']);
    const before = JSON.stringify(participants);

    applyPastPairingExclusions(participants, [{ giverId: 'A', receiverId: 'B' }]);

    expect(JSON.stringify(participants)).toBe(before);
  });

  it('skips pairings referencing unknown participants', () => {
    const participants = makeParticipants(['A', 'B']);
    const result = applyPastPairingExclusions(participants, [
      { giverId: 'A', receiverId: 'ghost' },
      { giverId: 'ghost', receiverId: 'B' },
    ]);

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('skips a pairing where giver equals receiver', () => {
    const participants = makeParticipants(['A', 'B']);
    const result = applyPastPairingExclusions(participants, [{ giverId: 'A', receiverId: 'A' }]);

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips a pairing that duplicates an existing mustNot rule of any origin', () => {
    const participants = makeParticipants(['A', 'B']);
    participants['A'].rules.push({ type: 'mustNot', targetParticipantId: 'B' });

    const result = applyPastPairingExclusions(participants, [{ giverId: 'A', receiverId: 'B' }]);

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips a pairing when the giver already has a must rule', () => {
    const participants = makeParticipants(['A', 'B', 'C']);
    participants['A'].rules.push({ type: 'must', targetParticipantId: 'C' });

    const result = applyPastPairingExclusions(participants, [{ giverId: 'A', receiverId: 'B' }]);

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.participants['A'].rules).toEqual([{ type: 'must', targetParticipantId: 'C' }]);
  });

  it('deduplicates repeated pairings in the input, counting the repeat as skipped', () => {
    const participants = makeParticipants(['A', 'B']);
    const result = applyPastPairingExclusions(participants, [
      { giverId: 'A', receiverId: 'B' },
      { giverId: 'A', receiverId: 'B' },
    ]);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.participants['A'].rules).toHaveLength(1);
  });
});

describe('removeHistoryExclusions / countHistoryExclusions', () => {
  it('strips only rules with origin history, keeping organiser rules', () => {
    const participants = makeParticipants(['A', 'B', 'C']);
    participants['A'].rules.push(
      { type: 'mustNot', targetParticipantId: 'B', origin: 'history' },
      { type: 'mustNot', targetParticipantId: 'C' },
    );

    expect(countHistoryExclusions(participants)).toBe(1);

    const cleaned = removeHistoryExclusions(participants);
    expect(cleaned['A'].rules).toEqual([{ type: 'mustNot', targetParticipantId: 'C' }]);
    expect(countHistoryExclusions(cleaned)).toBe(0);

    // Input left untouched.
    expect(participants['A'].rules).toHaveLength(2);
  });
});

describe('checkDrawFeasibility', () => {
  it('is feasible when a 3-cycle from last year is fully excluded', () => {
    // Last year: A->B, B->C, C->A. This year those are all mustNot, but
    // A->C, C->B, B->A is a valid new cycle.
    const participants = makeParticipants(['A', 'B', 'C']);
    const { participants: excluded } = applyPastPairingExclusions(participants, [
      { giverId: 'A', receiverId: 'B' },
      { giverId: 'B', receiverId: 'C' },
      { giverId: 'C', receiverId: 'A' },
    ]);

    expect(checkDrawFeasibility(excluded)).toEqual({ feasible: true });
  });

  it('is infeasible for a 2-person group with a past pairing, and flags history involvement', () => {
    const participants = makeParticipants(['A', 'B']);
    const { participants: excluded } = applyPastPairingExclusions(participants, [
      { giverId: 'A', receiverId: 'B' },
    ]);

    const result = checkDrawFeasibility(excluded);
    expect(result.feasible).toBe(false);
    if (!result.feasible) {
      expect(result.stuckGiverIds.length).toBeGreaterThan(0);
      expect(result.historyExclusionsInvolved).toBe(true);
    }
  });

  it('flags infeasibility caused only by organiser rules as not history-involved', () => {
    // Two people, mutual organiser mustNot rules (no history involved at all).
    const participants = makeParticipants(['A', 'B']);
    participants['A'].rules.push({ type: 'mustNot', targetParticipantId: 'B' });
    participants['B'].rules.push({ type: 'mustNot', targetParticipantId: 'A' });

    const result = checkDrawFeasibility(participants);
    expect(result.feasible).toBe(false);
    if (!result.feasible) {
      expect(result.historyExclusionsInvolved).toBe(false);
    }
  });

  it('is infeasible with fewer than two participants', () => {
    expect(checkDrawFeasibility(makeParticipants(['A']))).toEqual({
      feasible: false,
      stuckGiverIds: [],
      historyExclusionsInvolved: false,
    });
    expect(checkDrawFeasibility({})).toEqual({
      feasible: false,
      stuckGiverIds: [],
      historyExclusionsInvolved: false,
    });
  });

  it('is infeasible when rule validation fails (e.g. conflicting rules)', () => {
    const participants = makeParticipants(['A', 'B']);
    participants['A'].rules.push(
      { type: 'must', targetParticipantId: 'B' },
      { type: 'mustNot', targetParticipantId: 'B' },
    );

    const result = checkDrawFeasibility(participants);
    expect(result.feasible).toBe(false);
    if (!result.feasible) {
      expect(result.stuckGiverIds).toEqual(['A']);
      expect(result.historyExclusionsInvolved).toBe(false);
    }
  });

  it('matches generatePairs feasibility on random small groups with random mustNot rules', () => {
    const idArb = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H');

    const participantsArb = fc
      .uniqueArray(idArb, { minLength: 2, maxLength: 8 })
      .chain(ids => {
        const rulesForId = fc.array(fc.constantFrom(...ids), { maxLength: ids.length });
        return fc.record(
          Object.fromEntries(ids.map(id => [id, rulesForId])),
        ).map(rulesById => {
          const participants: Record<string, Participant> = {};
          for (const id of ids) {
            const rules: Rule[] = Array.from(new Set(rulesById[id]))
              .filter(targetId => targetId !== id)
              .map(targetId => ({ type: 'mustNot' as const, targetParticipantId: targetId }));
            participants[id] = { id, name: id, rules };
          }
          return participants;
        });
      });

    fc.assert(
      fc.property(participantsArb, participants => {
        const feasibility = checkDrawFeasibility(participants);
        const result = generatePairs(participants);

        expect(feasibility.feasible).toBe(result !== null);

        if (result !== null) {
          const ids = Object.keys(participants);
          const givers = new Set(result.pairings.map(p => p.giver.id));
          const receivers = new Set(result.pairings.map(p => p.receiver.id));
          expect(givers.size).toBe(ids.length);
          expect(receivers.size).toBe(ids.length);

          for (const { giver, receiver } of result.pairings) {
            expect(giver.id).not.toBe(receiver.id);
            const mustNotRules = participants[giver.id].rules.filter(r => r.type === 'mustNot');
            for (const rule of mustNotRules) {
              expect(receiver.id).not.toBe(rule.targetParticipantId);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
