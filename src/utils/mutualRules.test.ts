import { describe, it, expect } from 'vitest';
import { Participant, Rule } from '../types';
import { reverseState, saveRules } from './mutualRules';

const people = (rules: Record<string, Rule[]> = {}): Record<string, Participant> =>
  Object.fromEntries(['ana', 'bob', 'cat'].map(id => [id, { id, name: id, rules: rules[id] ?? [] }]));
const not = (target: string): Rule => ({ type: 'mustNot', targetParticipantId: target });
const must = (target: string): Rule => ({ type: 'must', targetParticipantId: target });

describe('reverseState', () => {
  it('is open when the other person has no rule about the owner', () => {
    expect(reverseState(people(), 'ana', 'bob')).toBe('open');
  });
  it('is done when the reverse rule exists', () => {
    expect(reverseState(people({ bob: [not('ana')] }), 'ana', 'bob')).toBe('done');
  });
  it('is done when the other person is forced to someone else', () => {
    expect(reverseState(people({ bob: [must('cat')] }), 'ana', 'bob')).toBe('done');
  });
  it('is blocked when the other person is forced to get the owner', () => {
    expect(reverseState(people({ bob: [must('ana')] }), 'ana', 'bob')).toBe('blocked');
  });
});

describe('saveRules', () => {
  it('adds the reverse rule for both-ways targets', () => {
    const next = saveRules(people(), 'ana', [not('bob')], 'socks', ['bob']);
    expect(next.ana.rules).toEqual([not('bob')]);
    expect(next.ana.hint).toBe('socks');
    expect(next.bob.rules).toEqual([not('ana')]);
  });
  it('leaves the other person alone when not both ways', () => {
    const next = saveRules(people(), 'ana', [not('bob')], '', []);
    expect(next.bob.rules).toEqual([]);
    expect(next.ana.hint).toBeUndefined();
  });
  it('does not duplicate or conflict with existing rules', () => {
    expect(saveRules(people({ bob: [not('ana')] }), 'ana', [not('bob')], '', ['bob']).bob.rules).toEqual([not('ana')]);
    expect(saveRules(people({ bob: [must('ana')] }), 'ana', [not('bob')], '', ['bob']).bob.rules).toEqual([must('ana')]);
    expect(saveRules(people({ bob: [must('cat')] }), 'ana', [not('bob')], '', ['bob']).bob.rules).toEqual([must('cat')]);
  });
  it('ignores both-ways targets the owner no longer blocks', () => {
    const next = saveRules(people(), 'ana', [], '', ['bob']);
    expect(next.bob.rules).toEqual([]);
  });
  it('does not change the input', () => {
    const before = people();
    saveRules(before, 'ana', [not('bob')], '', ['bob']);
    expect(before.bob.rules).toEqual([]);
  });
});
