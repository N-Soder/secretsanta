import type { LogKind } from '../../src/api/types';
import { formatBudget, formatEventDate } from '../../src/utils/format';
import { escapeHtml, type RenderedEmail } from './linkEmails';
import type { GroupRow, ParticipantRow } from './repo';

function render(subject: string, lines: string[], link: string): RenderedEmail {
  const text = [...lines, '', link, '', 'Keep this private link to yourself.'].join('\n');
  const html = `<!doctype html><html lang="en-AU"><body style="font-family:Helvetica,Arial,sans-serif;color:#1F2A27;padding:24px">${lines.map(line => `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join('')}<p><a href="${escapeHtml(link)}">Open my private link</a></p><p>Keep this private link to yourself.</p></body></html>`;
  return { subject, text, html };
}

// Accept only the giver's name. Matches and wishlists never enter a template.
export function renderParticipantEmail(kind: Exclude<LogKind, 'recovery'>, group: GroupRow, person: Pick<ParticipantRow, 'name'>, link: string): RenderedEmail {
  const intro = {
    link: 'Open your Secret Santa link to see who you’re buying for.',
    match_changed: 'The draw was redone. Open your link again to see your current match.',
    reminder_7d: 'Secret Santa is in 7 days. Open your link to check your match’s wishlist.',
    reminder_1d: 'Secret Santa is tomorrow. Open your link to check your match’s wishlist.',
  }[kind];
  const subject = { link: 'Your Secret Santa link', match_changed: 'Your Secret Santa match changed', reminder_7d: 'Secret Santa in 7 days', reminder_1d: 'Secret Santa tomorrow' }[kind];
  const lines = [`Hi ${person.name},`, intro];
  if (group.message) lines.push(group.message);
  if (group.budget_amount !== null) lines.push(`Budget: ${formatBudget(group.budget_amount, group.budget_currency)}`);
  if (group.event_date) lines.push(`Date: ${formatEventDate(group.event_date)}`);
  return render(subject, lines, link);
}

export function renderRecoveryEmail(link: string): RenderedEmail {
  return render('Your Secret Santa organiser link', ['Use this private link to manage your Secret Santa group.', 'Your previous organiser link is replaced after this email is sent.'], link);
}
