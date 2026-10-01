import { describe, expect, it } from 'vitest';
import { renderParticipantEmail, renderRecoveryEmail } from '../../functions/_shared/emails';
import { makeEnv } from '../helpers/env';
import { seedGroup } from '../helpers/fixtures';

const KINDS = {
  link: { eyebrow: 'Your draw is ready', heading: 'you’re a Secret Santa' },
  match_changed: { eyebrow: 'Match update', heading: 'the draw was redone' },
  reminder_7d: { eyebrow: 'One week to go', heading: 'Secret Santa is a week away' },
  reminder_1d: { eyebrow: 'Tomorrow', heading: 'Secret Santa is tomorrow' },
} as const;

describe('stored group emails', () => {
  it('renders all kinds with giver and formatted details, without accepting match data', async () => {
    const { group } = await seedGroup(makeEnv());
    for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
      const result = renderParticipantEmail(kind, group, { name: '<Ann>' }, 'https://site.test/s/abc');
      expect(result.text).toContain('Hi <Ann>');
      expect(result.html).toContain('&lt;Ann&gt;');
      expect(result.html).not.toContain('<Ann>');
      expect(result.text).toContain('Budget: $30');
      expect(result.text).toContain('20 December 2026');
      expect(result.html).toContain('20 December 2026');
      expect(result.text).not.toContain('Bob');
      expect(result.html).not.toContain('Bob');
    }
  });

  it('uses the site look with the kind’s label, heading and a button to the link', async () => {
    const { group } = await seedGroup(makeEnv());
    for (const [kind, copy] of Object.entries(KINDS) as [keyof typeof KINDS, typeof KINDS[keyof typeof KINDS]][]) {
      const { html } = renderParticipantEmail(kind, group, { name: 'Ann' }, 'https://site.test/s/abc');
      expect(html).toContain(copy.eyebrow);
      expect(html).toContain(copy.heading);
      expect(html).toContain('Open my Secret Santa link');
      expect(html).toContain('href="https://site.test/s/abc"');
      expect(html).toContain('#153B35');
      expect(html).toContain('https://site.test/email/fair-isle.png');
      expect(html).toContain('href="https://site.test/privacy"');
      expect(html).not.toMatch(/<script|<style/i);
    }
  });

  it('escapes messages and links, and omits absent settings', async () => {
    const { group } = await seedGroup(makeEnv());
    const email = renderParticipantEmail('link', { ...group, message: '<script>\nHello', budget_amount: null, event_date: null }, { name: 'Ann' }, 'https://site.test/s/a"b');
    expect(email.html).toContain('&lt;script&gt;<br>Hello');
    expect(email.html).toContain('href="https://site.test/s/a&quot;b"');
    expect(email.text).not.toContain('Budget:');
    expect(email.text).not.toContain('Date:');
    expect(email.html).not.toContain('Budget');
  });

  it('renders recovery with the organiser link and its own wording', () => {
    const email = renderRecoveryEmail('https://site.test/manage/abc');
    expect(email.subject).toBe('Your Secret Santa organiser link');
    expect(email.text).toContain('https://site.test/manage/abc');
    expect(email.html).toContain('Your new organiser link');
    expect(email.html).toContain('Open my organiser page');
    expect(email.html).toContain('href="https://site.test/manage/abc"');
    expect(email.html).toContain('https://site.test/email/snowflake.png');
  });
});
