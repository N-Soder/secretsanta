import type { CreateGroupRequest } from '../api/types';
import type { Participant } from '../types';
import type { ImportedSettings } from './historyCsv';

// The optional parts of the set-up card. Each is hidden until chosen, and a
// hidden extra is never submitted.
export type Extra = 'message' | 'budget' | 'date' | 'email';
export const EXTRAS: Extra[] = ['message', 'budget', 'date', 'email'];

const hasEmail = (people: Record<string, Participant>) => Object.values(people).some(person => person.email?.trim());

// Extras that already hold a value (a restored draft or an import) start open.
export function extrasWithValues(settings: ImportedSettings, message: string, people: Record<string, Participant>): Set<Extra> {
  const open = new Set<Extra>();
  if (message.trim()) open.add('message');
  if (settings.budgetAmount !== null) open.add('budget');
  if (settings.eventDate) open.add('date');
  if (settings.organiserEmail?.trim() || hasEmail(people)) open.add('email');
  return open;
}

interface Draft {
  settings: ImportedSettings;
  message: string;
  participants: Record<string, Participant>;
  open: ReadonlySet<Extra>;
  emailEnabled: boolean;
  reminders: boolean;
  timezone: string;
}

export function buildCreateRequest({ settings, message, participants, open, emailEnabled, reminders, timezone }: Draft): Omit<CreateGroupRequest, 'turnstileToken'> {
  const email = emailEnabled && open.has('email');
  const people = Object.values(participants).map(person => ({
    ...person, hint: person.hint ?? '', email: email ? person.email?.trim() || null : null,
  }));
  const eventDate = open.has('date') ? settings.eventDate : null;
  return {
    settings: {
      message: open.has('message') ? message : '',
      budgetAmount: open.has('budget') ? settings.budgetAmount : null,
      budgetCurrency: settings.budgetCurrency,
      eventDate,
      timezone,
      // Reminders need a date and someone to email; otherwise the server rejects them.
      remindersEnabled: email && reminders && !!eventDate && people.some(person => person.email),
      organiserEmail: email ? settings.organiserEmail?.trim() || null : null,
    },
    participants: people,
  };
}
