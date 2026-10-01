import type { Participant } from '../types';
import type { ImportedSettings } from './historyCsv';

export function sanitiseParticipants(people: Record<string, Participant>): Record<string, Participant> {
  return Object.fromEntries(Object.entries(people).map(([id, person]) => [id, {
    id: person.id, name: person.name, hint: person.hint, rules: person.rules,
  }]));
}
export function sanitiseSettings(settings: ImportedSettings): ImportedSettings {
  return { ...settings, organiserEmail: null };
}
