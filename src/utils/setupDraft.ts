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

// Run at app startup, including direct token visits, so old saved emails and
// assignments are retired even when the user does not open home first.
export function migrateBrowserDraft(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  try {
    storage.removeItem('secretSantaAssignments');
    const savedPeople = storage.getItem('secretSantaParticipants');
    if (savedPeople) {
      const people = JSON.parse(savedPeople);
      if (Array.isArray(people)) {
        storage.setItem('secretSantaParticipants', JSON.stringify(people.map(person => {
          const { email: _email, ...draft } = person; return draft;
        })));
      } else storage.setItem('secretSantaParticipants', JSON.stringify(sanitiseParticipants(people)));
    }
    const savedSettings = storage.getItem('secretSantaImportedSettings');
    if (savedSettings) storage.setItem('secretSantaImportedSettings', JSON.stringify(sanitiseSettings(JSON.parse(savedSettings))));
  } catch { /* Malformed or unavailable storage must not prevent token access. */ }
}
