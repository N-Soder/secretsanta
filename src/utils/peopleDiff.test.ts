import { describe, expect, it } from 'vitest';
import { peopleDiff } from './peopleDiff';
import type { ParticipantInput } from '../api/types';
const people: ParticipantInput[] = ['Ann', 'Bob', 'Cat'].map(name => ({ id: name, name, hint: '', email: null, rules: [] }));
const copy = () => structuredClone(people);
describe('peopleDiff', () => {
  it('patches display details under stable ids without redrawing', () => {
    const draft = copy();
    draft[0] = { ...draft[0], name: 'Annie', hint: 'Tea', email: 'ann@example.test' };
    expect(peopleDiff(people, draft)).toEqual({ requiresRedraw: false, changed: true, duplicateNames: [], patches: [{ id: 'Ann', name: 'Annie', hint: 'Tea', email: 'ann@example.test' }] });
  });
  it('does not redraw for a reorder or rename swap', () => {
    expect(peopleDiff(people, [...people].reverse()).changed).toBe(false);
    const draft = copy(); [draft[0].name, draft[1].name] = [draft[1].name, draft[0].name];
    expect(peopleDiff(people, draft).requiresRedraw).toBe(false);
  });
  it('redraws for additions, removals and replacement identities', () => {
    expect(peopleDiff(people, [...people, { ...people[0], id: 'client-uuid', name: 'Dan' }]).requiresRedraw).toBe(true);
    expect(peopleDiff(people, people.slice(1)).requiresRedraw).toBe(true);
    expect(peopleDiff(people, people.map(p => ({ ...p, id: p.id + 'new' }))).requiresRedraw).toBe(true);
  });
  it('compares rule constraints independent of order and preserves history origin', () => {
    const before = copy();
    before[0].rules = [{ type: 'mustNot', targetParticipantId: 'Bob', origin: 'history' }, { type: 'mustNot', targetParticipantId: 'Cat' }];
    const draft = structuredClone(before); draft[0].rules.reverse();
    expect(peopleDiff(before, draft).changed).toBe(false);
    delete draft[0].rules[1].origin;
    expect(peopleDiff(before, draft).requiresRedraw).toBe(true);
    draft[0].rules = [];
    expect(peopleDiff(before, draft).requiresRedraw).toBe(true);
  });
  it('detects case insensitive duplicate names without replacing ids', () => {
    const draft = copy(); draft[1].name = ' ann ';
    expect(peopleDiff(people, draft).duplicateNames).toEqual([' ann ']);
    expect(peopleDiff(people, draft).patches).toEqual([{ id: 'Bob', name: ' ann ' }]);
  });
  it('does not mistake duplicate ids for a safe patch', () => {
    expect(peopleDiff(people, [people[0], people[0], people[2]]).requiresRedraw).toBe(true);
  });
});
