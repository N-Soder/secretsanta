import { describe, it, expect } from 'vitest';
import { parseParticipantsJson } from './participantsJson';
import { serialiseLinksCsv } from './historyCsv';

function byName(participants: Record<string, { id: string; name: string }>) {
  return Object.fromEntries(Object.values(participants).map(p => [p.name, p.id]));
}

describe('parseParticipantsJson', () => {
  it('reads names, hints, rules and the message', () => {
    const result = parseParticipantsJson(JSON.stringify({
      message: 'Budget is $30',
      participants: [
        { name: 'Sam', hint: 'likes tea', mustGiveTo: 'alex' },
        { name: 'Alex', mustNotGiveTo: ['Jo'] },
        'Jo',
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = byName(result.data.participants);
    expect(result.data.settings.message).toBe('Budget is $30');
    expect(result.data.pastPairings).toEqual([]);
    expect(result.data.participants[ids.Sam]).toMatchObject({ hint: 'likes tea', rules: [{ type: 'must', targetParticipantId: ids.Alex }] });
    expect(result.data.participants[ids.Alex].rules).toEqual([{ type: 'mustNot', targetParticipantId: ids.Jo }]);
    expect(result.data.participants[ids.Jo].rules).toEqual([]);
  });

  it('accepts a bare array', () => {
    const result = parseParticipantsJson('["Sam", "Alex"]');
    expect(result.ok && Object.keys(result.data.participants)).toHaveLength(2);
  });

  it.each([
    ['not json', 'invalidJson'],
    ['{"people": []}', 'invalidShape'],
    ['[]', 'emptyFile'],
    ['[{"hint": "x"}]', 'invalidEntry'],
    ['["Sam", "sam"]', 'duplicateName'],
    ['[{"name": "Sam", "mustGiveTo": "Nobody"}, "Alex"]', 'unknownName'],
    ['[{"name": "Sam", "mustGiveTo": "Sam"}, "Alex"]', 'unknownName'],
    ['[{"name": "Sam", "mustGiveTo": "Alex", "mustNotGiveTo": ["Alex"]}, "Alex"]', 'conflictingRules'],
    ['[{"name": "Sam", "mustNotGiveTo": 3}]', 'invalidField'],
  ])('rejects %s', (text, key) => {
    const result = parseParticipantsJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map(e => e.key)).toContain(key);
  });
});

describe('serialiseLinksCsv', () => {
  it('writes names, email addresses and links, neutralising formulas', () => {
    const csv = serialiseLinksCsv([
      { name: 'Sam', email: null, link: 'https://x/s/abc' },
      { name: '=Evil', email: null, link: 'https://x/s/def' },
    ]);
    expect(csv).toBe('﻿name,email,link\r\nSam,,https://x/s/abc\r\n\'=Evil,,https://x/s/def\r\n');
  });
});
