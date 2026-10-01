import type { LogKind } from '../../src/api/types';
import { formatBudget, formatEventDate } from '../../src/utils/format';
import { escapeHtml, type RenderedEmail } from './emailFormat';
import type { GroupRow, ParticipantRow } from './repo';

// Colours and type follow the site's Linen theme (tailwind.config.js). Email
// clients need tables and inline styles; fonts fall back to Georgia/Helvetica.
const C = { pine: '#153B35', ivory: '#F7F2E8', paper: '#FFFDF8', cranberry: '#A9473D', gold: '#C59A52', ink: '#1C2F2B', body: '#3D514B', muted: '#66786F', line: '#E6DFD0' };
const SANS = `'DM Sans',Helvetica,Arial,sans-serif`;
const SERIF = `'DM Serif Display',Georgia,'Times New Roman',serif`;

interface Layout {
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  details?: { budget?: string; date?: string; message?: string };
  button: string;
  link: string;
  footer: string;
}

const paragraphs = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');

function render(email: Layout): RenderedEmail {
  // Images and the privacy link come from the same site as the link itself, so
  // preview emails point at the preview site.
  const origin = new URL(email.link).origin;
  const link = escapeHtml(email.link);
  const { budget, date, message } = email.details ?? {};
  const label = (text: string) => `<td style="padding:2px 16px 2px 0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};white-space:nowrap;">${text}</td>`;
  const facts = [budget && `<tr>${label('Budget')}<td style="padding:2px 0;font-weight:700;">${escapeHtml(budget)}</td></tr>`,
    date && `<tr>${label('Date')}<td style="padding:2px 0;font-weight:700;">${escapeHtml(date)}</td></tr>`].filter(Boolean).join('');
  const panel = facts || message ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};border-radius:12px;"><tr><td style="padding:16px 20px;font-size:15px;line-height:1.5;color:${C.ink};">${facts ? `<table role="presentation" cellpadding="0" cellspacing="0">${facts}</table>` : ''}${message ? `<p style="margin:${facts ? `12px 0 0;padding-top:12px;border-top:1px solid ${C.line}` : '0'};color:${C.body};">${paragraphs(message)}</p>` : ''}</td></tr></table>` : '';

  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(email.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&amp;family=DM+Serif+Display&amp;display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.ivory};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(email.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.paper};border:1px solid ${C.line};border-radius:18px;overflow:hidden;">
<tr><td height="28" background="${origin}/email/fair-isle.png" style="height:28px;background:${C.pine} url('${origin}/email/fair-isle.png') repeat-x center;background-size:auto 28px;border-top:3px solid ${C.cranberry};border-bottom:3px solid ${C.cranberry};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 0;font-family:${SERIF};font-size:22px;color:${C.pine};"><img src="${origin}/email/snowflake.png" width="20" height="20" alt="" style="vertical-align:-3px;margin-right:8px;border:0;">Secret Santa</td></tr>
<tr><td style="padding:28px 28px 0;font-family:${SANS};">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.gold};">${escapeHtml(email.eyebrow)}</p>
<h1 style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.15;color:${C.pine};">${escapeHtml(email.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${C.body};">${escapeHtml(email.intro)}</p>
${panel}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 12px;"><tr><td style="border-radius:999px;background:${C.pine};"><a href="${link}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:700;color:${C.paper};text-decoration:none;border-radius:999px;">${escapeHtml(email.button)}</a></td></tr></table>
<p style="margin:0 0 28px;font-size:13px;line-height:1.5;color:${C.muted};">Or paste this into your browser:<br><a href="${link}" style="color:${C.pine};word-break:break-all;">${link}</a></p>
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">
<p style="margin:0 0 8px;"><strong style="color:${C.cranberry};">Keep this link to yourself.</strong> ${escapeHtml(email.footer)}</p>
<p style="margin:0;">Sent by Secret Santa at ${escapeHtml(new URL(email.link).host)}. <a href="${origin}/privacy" style="color:${C.muted};">Privacy</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    email.heading, '', email.intro,
    ...(budget || date ? [''] : []), ...(budget ? [`Budget: ${budget}`] : []), ...(date ? [`Date: ${date}`] : []), ...(message ? ['', message] : []),
    '', `${email.button}:`, email.link, '', `Keep this link to yourself. ${email.footer}`, `Privacy: ${origin}/privacy`,
  ].join('\n');
  return { subject: email.subject, text, html };
}

// Accept only the giver's name. Matches and wishlists never enter a template.
export function renderParticipantEmail(kind: Exclude<LogKind, 'recovery'>, group: GroupRow, person: Pick<ParticipantRow, 'name'>, link: string): RenderedEmail {
  const copy = {
    link: { subject: 'Your Secret Santa link', eyebrow: 'Your draw is ready', heading: `Hi ${person.name}, you’re a Secret Santa`, intro: 'Open your private link to see who you’re buying for, read their wishlist and add your own.' },
    match_changed: { subject: 'Your Secret Santa match changed', eyebrow: 'Match update', heading: `Hi ${person.name}, the draw was redone`, intro: 'Your match may have changed. Open your link again to see who you’re buying for now.' },
    reminder_7d: { subject: 'Secret Santa in 7 days', eyebrow: 'One week to go', heading: 'Secret Santa is a week away', intro: `Hi ${person.name}, open your link to check your match’s wishlist and make sure your own is up to date.` },
    reminder_1d: { subject: 'Secret Santa tomorrow', eyebrow: 'Tomorrow', heading: 'Secret Santa is tomorrow', intro: `Hi ${person.name}, it’s nearly time. Open your link for one last look at your match’s wishlist.` },
  }[kind];
  return render({
    ...copy, link, button: 'Open my Secret Santa link',
    details: {
      budget: group.budget_amount !== null ? formatBudget(group.budget_amount, group.budget_currency) : undefined,
      date: group.event_date ? formatEventDate(group.event_date) : undefined,
      message: group.message || undefined,
    },
    footer: 'Anyone who has it can see your match.',
  });
}

export function renderRecoveryEmail(link: string): RenderedEmail {
  return render({
    subject: 'Your Secret Santa organiser link', eyebrow: 'Organiser link', heading: 'Your new organiser link',
    intro: 'Use this private link to manage your Secret Santa group. It replaces your previous organiser link.',
    button: 'Open my organiser page', link,
    footer: 'Anyone who has it can change or delete your group.',
  });
}
