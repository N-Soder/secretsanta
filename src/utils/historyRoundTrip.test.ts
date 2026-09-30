import { describe, it, expect } from 'vitest';
import { Participant } from '../types';
import { generatePairs } from './generatePairs';
import { parseHistoryCsv, serialiseHistoryCsv } from './historyCsv';
import { applyPastPairingExclusions, checkDrawFeasibility } from './historyExclusions';

function makeParticipants(names: string[]): Record<string, Participant> {
  return Object.fromEntries(names.map(name => [`id-${name}`, { id: `id-${name}`, name, rules: [] }]));
}

describe('history round trip', () => {
  it('never repeats last year’s pairings in the next draw', () => {
    const lastYear = makeParticipants(['Ava', 'Ben', 'Chloe', 'Dev', 'Eli']);

    for (let run = 0; run < 50; run++) {
      const assignments = generatePairs(lastYear)!;
      const csv = serialiseHistoryCsv({
        participants: lastYear,
        assignments,
        instructions: 'Budget $30',
        links: {},
        exportedAt: new Date('2026-12-01T00:00:00Z'),
      });

      const parsed = parseHistoryCsv(csv);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const { participants } = applyPastPairingExclusions(parsed.data.participants, parsed.data.pastPairings);
      expect(checkDrawFeasibility(participants).feasible).toBe(true);

      const nextYear = generatePairs(participants)!;
      const previous = new Set(assignments.pairings.map(p => `${p.giver.id}>${p.receiver.id}`));
      for (const pairing of nextYear.pairings) {
        expect(previous.has(`${pairing.giver.id}>${pairing.receiver.id}`)).toBe(false);
      }
    }
  });

  it('blocks a two-person draw that could only repeat, and blames the past-draw exclusions', () => {
    const lastYear = makeParticipants(['Ava', 'Ben']);
    const csv = serialiseHistoryCsv({
      participants: lastYear,
      assignments: generatePairs(lastYear)!,
      instructions: '',
      links: {},
      exportedAt: new Date(),
    });

    const parsed = parseHistoryCsv(csv);
    if (!parsed.ok) throw new Error('expected a valid file');

    const { participants } = applyPastPairingExclusions(parsed.data.participants, parsed.data.pastPairings);
    expect(generatePairs(participants)).toBeNull();
    expect(checkDrawFeasibility(participants)).toMatchObject({ feasible: false, historyExclusionsInvolved: true });
  });
});
