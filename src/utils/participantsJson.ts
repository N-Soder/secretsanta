import { Participant, Rule } from '../types';
import { EMAIL_PATTERN, LIMITS } from '../api/limits';
import { parseImportedSettings } from './importSettings';
import { checkRules } from './generatePairs';
import { HistoryParseError, HistoryParseResult, ImportedSettings } from './historyCsv';

// A hand-written participant list, for organisers who keep their group in a
// file. Either a bare array or an object with a "participants" array:
//
//   {
//     "message": "Bring a card.",
//     "budget": 30, "currency": "AUD", "eventDate": "2026-12-20",
//     "organiserEmail": "organiser@example.com",
//     "participants": [
//       { "name": "Sam", "hint": "likes tea", "email": "sam@example.com", "mustGiveTo": "Alex", "mustNotGiveTo": ["Jo"] },
//       "Jo"
//     ]
//   }
//
// Rules refer to other people by name. Errors use 1-based entry numbers.

interface RawEntry {
  line: number;
  name: string;
  hint?: string;
  email?: string;
  mustGiveTo?: string;
  mustNotGiveTo: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseParticipantsJson(text: string): HistoryParseResult {
  if (text.replace(/^﻿/, '').trim() === '') {
    return { ok: false, errors: [{ line: null, key: 'emptyFile' }] };
  }

  let root: unknown;
  try {
    root = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, errors: [{ line: null, key: 'invalidJson' }] };
  }

  const list = Array.isArray(root)
    ? root
    : isPlainObject(root) && Array.isArray(root.participants) ? root.participants : null;
  if (list === null) {
    return { ok: false, errors: [{ line: null, key: 'invalidShape' }] };
  }
  if (list.length === 0) {
    return { ok: false, errors: [{ line: null, key: 'emptyFile' }] };
  }

  const errors: HistoryParseError[] = [];

  const parsedSettings = parseImportedSettings(isPlainObject(root) ? root : {});
  const settings = parsedSettings.settings;
  errors.push(...parsedSettings.errors);
  if (list.length > LIMITS.participants) {
    return { ok: false, errors: [{ line: null, key: 'invalidField', params: { field: 'participants', expected: `at most ${LIMITS.participants} people` } }] };
  }

  const entries: RawEntry[] = [];
  list.forEach((item: unknown, index: number) => {
    const line = index + 1;

    if (typeof item === 'string') {
      entries.push({ line, name: item.trim(), mustNotGiveTo: [] });
      return;
    }
    if (!isPlainObject(item) || typeof item.name !== 'string') {
      errors.push({ line, key: 'invalidEntry' });
      return;
    }

    const entry: RawEntry = { line, name: item.name.trim(), mustNotGiveTo: [] };

    if (item.email !== undefined && item.email !== null && item.email !== '') {
      const email = typeof item.email === 'string' ? item.email.trim() : '';
      if (typeof item.email === 'string' && email === '') entry.email = undefined;
      else if (email.length <= LIMITS.email && EMAIL_PATTERN.test(email)) entry.email = email;
      else errors.push({ line, key: 'invalidEmail', params: { email } });
    }
    if (item.hint !== undefined) {
      if (typeof item.hint === 'string' && item.hint.length <= LIMITS.hint) {
        entry.hint = item.hint.trim() || undefined;
      } else {
        errors.push({ line, key: 'invalidField', params: { field: 'hint', expected: 'text' } });
      }
    }
    if (item.mustGiveTo !== undefined) {
      if (typeof item.mustGiveTo === 'string') {
        entry.mustGiveTo = item.mustGiveTo.trim() || undefined;
      } else {
        errors.push({ line, key: 'invalidField', params: { field: 'mustGiveTo', expected: 'a name' } });
      }
    }
    if (item.mustNotGiveTo !== undefined) {
      const value = typeof item.mustNotGiveTo === 'string' ? [item.mustNotGiveTo] : item.mustNotGiveTo;
      if (Array.isArray(value) && value.every(name => typeof name === 'string')) {
        entry.mustNotGiveTo = value.map(name => name.trim()).filter(Boolean);
      } else {
        errors.push({ line, key: 'invalidField', params: { field: 'mustNotGiveTo', expected: 'a list of names' } });
      }
    }

    entries.push(entry);
  });

  // Names are matched case-insensitively, as in the history CSV.
  const idByName = new Map<string, string>();
  const participants: Record<string, Participant> = {};

  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (!entry.name) {
      errors.push({ line: entry.line, key: 'emptyName' });
    } else if (entry.name.length > LIMITS.name) {
      errors.push({ line: entry.line, key: 'invalidField', params: { field: 'name', expected: `at most ${LIMITS.name} characters` } });
    } else if (idByName.has(key)) {
      errors.push({ line: entry.line, key: 'duplicateName', params: { name: entry.name } });
    } else {
      const id = crypto.randomUUID();
      idByName.set(key, id);
      participants[id] = { id, name: entry.name, hint: entry.hint, email: entry.email, rules: [] };
    }
  }

  for (const entry of entries) {
    const id = idByName.get(entry.name.toLowerCase());
    if (!id || participants[id].name !== entry.name) continue;

    const resolve = (name: string) => {
      const targetId = idByName.get(name.toLowerCase());
      if (!targetId || targetId === id) {
        errors.push({ line: entry.line, key: 'unknownName', params: { name } });
        return null;
      }
      return targetId;
    };

    const rules: Rule[] = [];
    const mustId = entry.mustGiveTo ? resolve(entry.mustGiveTo) : null;
    if (mustId) rules.push({ type: 'must', targetParticipantId: mustId });

    for (const name of entry.mustNotGiveTo) {
      const targetId = resolve(name);
      if (targetId && !rules.some(rule => rule.targetParticipantId === targetId && rule.type === 'mustNot')) {
        rules.push({ type: 'mustNot', targetParticipantId: targetId });
      }
    }

    if (checkRules(rules) !== null) {
      errors.push({ line: entry.line, key: 'conflictingRules', params: { name: entry.name } });
      continue;
    }

    participants[id].rules = rules;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: { exportedAt: null, participants, settings, pastPairings: [] } };
}

// JSON carries the current setup, including every active exclusion. The CSV
// history separately carries past pairings for next year's avoid-repeats choice.
export function serialiseParticipantsJson(participants: Record<string, Participant>, settings: ImportedSettings): string {
  const nameOf = (id: string) => participants[id]?.name;
  const people = Object.values(participants).slice().sort((a, b) => a.name.localeCompare(b.name)).map(person => {
    const must = person.rules.find(rule => rule.type === 'must');
    const mustNot = person.rules.filter(rule => rule.type === 'mustNot').map(rule => nameOf(rule.targetParticipantId)).filter((name): name is string => name !== undefined);
    return {
      name: person.name,
      ...(person.hint ? { hint: person.hint } : {}),
      ...(person.email ? { email: person.email } : {}),
      ...(must && nameOf(must.targetParticipantId) ? { mustGiveTo: nameOf(must.targetParticipantId) } : {}),
      ...(mustNot.length ? { mustNotGiveTo: [...new Set(mustNot)] } : {}),
    };
  });
  return JSON.stringify({
    message: settings.message, budget: settings.budgetAmount === null ? null : settings.budgetAmount / 100,
    currency: settings.budgetCurrency, eventDate: settings.eventDate, organiserEmail: settings.organiserEmail,
    participants: people,
  }, null, 2) + '\n';
}
