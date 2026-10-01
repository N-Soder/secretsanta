import { describe, expect, it } from 'vitest';
import { renderParticipantEmail, renderRecoveryEmail } from '../../functions/_shared/emails';
import { makeEnv } from '../helpers/env';
import { seedGroup } from '../helpers/fixtures';

describe('stored group emails', () => {
  it('renders all kinds with giver and formatted details, without accepting match data', async () => {
    const { group } = await seedGroup(makeEnv());
    for (const kind of ['link', 'match_changed', 'reminder_7d', 'reminder_1d'] as const) {
      const result = renderParticipantEmail(kind, group, { name: '<Ann>' }, 'https://site.test/s/abc');
      expect(result.text).toContain('Hi <Ann>');
      expect(result.html).toContain('&lt;Ann&gt;');
      expect(result.text).toContain('Budget: $30');
      expect(result.text).toContain('20 December 2026');
      expect(result.text).not.toContain('Bob');
    }
  });
  it('escapes messages, omits absent settings, and renders recovery', async () => {
    const { group } = await seedGroup(makeEnv());
    const email = renderParticipantEmail('link', { ...group, message: '<script>\nHello', budget_amount: null, event_date: null }, { name: 'Ann' }, 'https://site.test/s/abc');
    expect(email.html).toContain('&lt;script&gt;<br>Hello');
    expect(email.text).not.toContain('Budget:');
    expect(email.text).not.toContain('Date:');
    expect(renderRecoveryEmail('https://site.test/manage/abc').text).toContain('https://site.test/manage/abc');
  });
});
