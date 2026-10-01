import { Participant, Rule } from '../types';
import { checkRules } from './generatePairs';
import { HistoryParseError, HistoryParseResult } from './historyCsv';

// A hand-written participant list, for organisers who keep their group in a
// file. Either a bare array or an object with a "participants" array:
//
//   {
//     "message": "Budget is $30.",
//     "participants": [
//       { "name": "Sam", "hint": "likes tea", "mustGiveTo": "Alex", "mustNotGiveTo": ["Jo"] },
//       "Jo"
//     ]
//   }
//
// Rules refer to other people by name. Errors use 1-based entry numbers.

interface RawEntry {
  line: number;
  name: string;
  hint?: string;
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

  let instructions = '';
  if (isPlainObject(root) && root.message !== undefined) {
    if (typeof root.message === 'string') {
      instructions = root.message;
    } else {
      errors.push({ line: null, key: 'invalidField', params: { field: 'message', expected: 'text' } });
    }
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

    if (item.hint !== undefined) {
      if (typeof item.hint === 'string') {
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
    } else if (idByName.has(key)) {
      errors.push({ line: entry.line, key: 'duplicateName', params: { name: entry.name } });
    } else {
      const id = crypto.randomUUID();
      idByName.set(key, id);
      participants[id] = { id, name: entry.name, hint: entry.hint, rules: [] };
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

  return { ok: true, data: { exportedAt: null, participants, instructions, pastPairings: [] } };
}
