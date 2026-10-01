import type { ExportFormat } from '../../src/api/types';
import type { Participant, Rule } from '../../src/types';
import { serialiseHistoryCsv, serialiseLinksCsv } from '../../src/utils/historyCsv';
import { serialiseParticipantsJson } from '../../src/utils/participantsJson';
import type { Context } from './env';
import { apiError } from './http';
import { findGroupByManageToken, loadExportSnapshot, participantLink, settingsFromRow } from './repo';
import { isTokenShape, MANAGE_TOKEN_LENGTH, openToken } from './tokens';

export async function exportGroup(ctx: Context<'token'>): Promise<Response> {
  if (!isTokenShape(ctx.params.token, MANAGE_TOKEN_LENGTH)) return apiError('notFound', 404);
  const now = new Date();
  const format = new URL(ctx.request.url).searchParams.get('format');
  if (format !== 'history' && format !== 'links' && format !== 'json') {
    const group = await findGroupByManageToken(ctx.env.DB, ctx.params.token, now);
    return group ? apiError('invalid', 400, { field: 'format' }) : apiError('notFound', 404);
  }
  const snapshot = await loadExportSnapshot(ctx.env.DB, ctx.params.token, format, now);
  if (!snapshot) return apiError('notFound', 404);
  const { group, participants: people, rules: ruleRows, pairings } = snapshot;
  let content: string;
  if (format === 'links') {
    const rows = await Promise.all(people.map(async person => {
      if (!person.link_token_sealed) throw new Error('Missing sealed participant link');
      return { name: person.name, email: person.email, link: participantLink(group.site_origin, await openToken(person.link_token_sealed, ctx.env.LINK_KEY)) };
    }));
    content = serialiseLinksCsv(rows);
  } else {
    const rules = new Map<string, Rule[]>();
    for (const row of ruleRows) {
      const rule: Rule = { type: row.type, targetParticipantId: row.target_id, ...(row.origin ? { origin: row.origin } : {}) };
      rules.set(row.giver_id, [...(rules.get(row.giver_id) ?? []), rule]);
    }
    const participants: Record<string, Participant> = Object.fromEntries(people.map(person => [person.id, {
      id: person.id, name: person.name, hint: person.hint || undefined, email: person.email ?? undefined, rules: rules.get(person.id) ?? [],
    }]));
    const settings = settingsFromRow(group);
    content = format === 'history'
      ? serialiseHistoryCsv({ participants, pairings, settings, exportedAt: now })
      : serialiseParticipantsJson(participants, settings);
  }
  return download(content, format, now);
}

function download(content: string, format: ExportFormat, now: Date): Response {
  const extension = format === 'json' ? 'json' : 'csv';
  return new Response(content, { headers: {
    'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="secret-santa-${format}-${now.toISOString().slice(0, 10)}.${extension}"`,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  } });
}
