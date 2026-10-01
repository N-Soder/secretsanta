import type { GroupSettings, ParticipantInput } from '../../src/api/types';
import type { Env } from '../../functions/_shared/env';
import { createGroup, findGroupByManageToken, GroupRow, loadParticipants } from '../../functions/_shared/repo';
import { openToken } from '../../functions/_shared/tokens';
import { ORIGIN } from './env';

export const SETTINGS: GroupSettings = {
  message: 'Bring a card', budgetAmount: 3000, budgetCurrency: 'AUD', eventDate: '2026-12-20',
  timezone: 'Australia/Perth', remindersEnabled: false, organiserEmail: 'org@example.com',
};

export const PEOPLE: ParticipantInput[] = [
  { id: 'c-ann', name: 'Ann', hint: 'tea', email: 'ann@example.com', rules: [] },
  { id: 'c-bob', name: 'Bob', hint: '', email: 'bob@example.com', rules: [] },
  { id: 'c-cat', name: 'Cat', hint: '', email: null, rules: [] },
];

// Ann → Bob → Cat → Ann, so tests can assert exact receivers.
export const PAIRS = new Map([['c-ann', 'c-bob'], ['c-bob', 'c-cat'], ['c-cat', 'c-ann']]);

export const NOW = new Date('2026-10-01T03:00:00Z');

export async function seedGroup(env: Env, overrides: Partial<GroupSettings> = {}) {
  const { manageToken } = await createGroup(env.DB, {
    settings: { ...SETTINGS, ...overrides }, participants: PEOPLE, pairs: PAIRS, linkKey: env.LINK_KEY, origin: ORIGIN, now: NOW,
  });
  const group = (await findGroupByManageToken(env.DB, manageToken, NOW)) as GroupRow;
  const tokens: Record<string, string> = {};
  for (const person of await loadParticipants(env.DB, group.id)) {
    tokens[person.name] = await openToken(person.link_token_sealed, env.LINK_KEY);
  }
  return { manageToken, group, tokens };
}
