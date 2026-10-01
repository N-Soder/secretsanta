import { CURRENCY_PATTERN, DATE_PATTERN, EMAIL_PATTERN, LIMITS } from '../../src/api/limits';
import type { GroupSettings, ParticipantInput, ParticipantPatch, SettingsPatch } from '../../src/api/types';
import type { Rule } from '../../src/types';
import { checkRules } from '../../src/utils/generatePairs';
import { isValidTimeZone } from './reminders';

export type Validation<T> = { ok: true; value: T } | { ok: false; field: string };

const fail = (field: string): { ok: false; field: string } => ({ ok: false, field });
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normaliseEmail(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  const email = raw.trim();
  if (email === '') return null;
  return email.length <= LIMITS.email && EMAIL_PATTERN.test(email) ? email : undefined;
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const shortText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

// Field checkers return the normalised value, or undefined when invalid.
const SETTINGS_FIELDS: { [K in keyof GroupSettings]: (value: unknown) => GroupSettings[K] | undefined } = {
  message: value => shortText(value, LIMITS.message) ? value as string : undefined,
  budgetAmount: value => value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= LIMITS.budgetMaxCents)
    ? value as number | null : undefined,
  budgetCurrency: value => typeof value === 'string' && CURRENCY_PATTERN.test(value) ? value : undefined,
  eventDate: value => value === null || (typeof value === 'string' && isRealDate(value)) ? value as string | null : undefined,
  timezone: value => typeof value === 'string' && value.length <= 64 && isValidTimeZone(value) ? value : undefined,
  remindersEnabled: value => typeof value === 'boolean' ? value : undefined,
  organiserEmail: value => normaliseEmail(value),
};

export function validateSettingsPatch(raw: unknown): Validation<SettingsPatch> {
  if (!isPlainObject(raw)) return fail('settings');
  const value: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(raw)) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_FIELDS, key)) return fail(`settings.${key}`);
    const check = SETTINGS_FIELDS[key as keyof GroupSettings];
    if (!check) return fail(`settings.${key}`);
    const checked = check(input);
    if (checked === undefined) return fail(`settings.${key}`);
    value[key] = checked;
  }
  return { ok: true, value: value as SettingsPatch };
}

export function validateSettings(raw: unknown): Validation<GroupSettings> {
  const patch = validateSettingsPatch(raw);
  if (!patch.ok) return patch;
  for (const key of Object.keys(SETTINGS_FIELDS)) {
    if (!(key in patch.value)) return fail(`settings.${key}`);
  }
  const settings = patch.value as GroupSettings;
  if (settings.remindersEnabled && !settings.eventDate) return fail('settings.remindersEnabled');
  return { ok: true, value: settings };
}

function validateRules(raw: unknown, selfId: string, ids: Set<string>): Rule[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rules: Rule[] = [];
  const targets = new Set<string>();
  for (const rule of raw) {
    if (!isPlainObject(rule)) return undefined;
    const { type, targetParticipantId, origin } = rule;
    if (type !== 'must' && type !== 'mustNot') return undefined;
    if (typeof targetParticipantId !== 'string' || !ids.has(targetParticipantId) || targetParticipantId === selfId) return undefined;
    if (origin !== undefined && origin !== 'history') return undefined;
    if (targets.has(targetParticipantId)) return undefined;
    targets.add(targetParticipantId);
    rules.push(origin ? { type, targetParticipantId, origin } : { type, targetParticipantId });
  }
  return checkRules(rules) === null ? rules : undefined;
}

export function validateParticipants(raw: unknown): Validation<ParticipantInput[]> {
  if (!Array.isArray(raw) || raw.length < LIMITS.minParticipants || raw.length > LIMITS.participants) return fail('participants');

  const ids = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id) || ids.has(entry.id)) {
      return fail(`participants[${index}].id`);
    }
    ids.add(entry.id);
  }

  const names = new Set<string>();
  const people: ParticipantInput[] = [];
  for (const [index, entry] of (raw as Record<string, unknown>[]).entries()) {
    const at = (field: string) => fail(`participants[${index}].${field}`);
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (name === '' || name.length > LIMITS.name || names.has(name.toLowerCase())) return at('name');
    names.add(name.toLowerCase());

    const hint = entry.hint === undefined ? '' : entry.hint;
    if (!shortText(hint, LIMITS.hint)) return at('hint');

    const email = normaliseEmail(entry.email);
    if (email === undefined) return at('email');

    const rules = validateRules(entry.rules ?? [], entry.id as string, ids);
    if (!rules) return at('rules');

    people.push({ id: entry.id as string, name, hint: (hint as string).trim(), email, rules });
  }
  return { ok: true, value: people };
}

export function validateParticipantPatches(raw: unknown): Validation<ParticipantPatch[]> {
  if (!Array.isArray(raw) || raw.length > LIMITS.participants) return fail('participants');
  const patches: ParticipantPatch[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const at = (field: string) => fail(`participants[${index}].${field}`);
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) return at('id');
    if (ids.has(entry.id)) return at('id');
    ids.add(entry.id);
    if (Object.keys(entry).some(key => !['id', 'name', 'hint', 'email'].includes(key))) return at('fields');
    const patch: ParticipantPatch = { id: entry.id };
    if ('name' in entry) {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (name === '' || name.length > LIMITS.name) return at('name');
      patch.name = name;
    }
    if ('hint' in entry) {
      if (!shortText(entry.hint, LIMITS.hint)) return at('hint');
      patch.hint = (entry.hint as string).trim();
    }
    if ('email' in entry) {
      const email = normaliseEmail(entry.email);
      if (email === undefined) return at('email');
      patch.email = email;
    }
    patches.push(patch);
  }
  return { ok: true, value: patches };
}

export function validateWishlist(raw: unknown): Validation<string> {
  return shortText(raw, LIMITS.wishlist) ? { ok: true, value: raw as string } : fail('wishlist');
}
