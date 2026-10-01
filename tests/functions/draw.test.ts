import { describe, expect, it } from 'vitest';
import { drawPairs } from '../../functions/_shared/draw';
import type { ParticipantInput } from '../../src/api/types';

const person = (id: string, rules: ParticipantInput['rules'] = []): ParticipantInput => ({ id, name: id.toUpperCase(), hint: '', email: null, rules });

describe('drawPairs', () => {
  it('pairs everyone with someone else, each receiver once', () => {
    const outcome = drawPairs(['a', 'b', 'c', 'd'].map(id => person(id)));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect([...outcome.pairs.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(outcome.pairs.values()).size).toBe(4);
    for (const [giver, receiver] of outcome.pairs) expect(giver).not.toBe(receiver);
  });

  it('honours must rules', () => {
    const outcome = drawPairs([person('a', [{ type: 'must', targetParticipantId: 'c' }]), person('b'), person('c')]);
    expect(outcome.ok && outcome.pairs.get('a')).toBe('c');
  });

  it('names who is stuck when the rules make a draw impossible', () => {
    const outcome = drawPairs([
      person('a', [{ type: 'mustNot', targetParticipantId: 'b' }]),
      person('b'),
    ]);
    expect(outcome).toEqual({ ok: false, stuckGiverIds: ['a'] });
  });
});
