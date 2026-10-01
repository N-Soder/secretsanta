import type { ParticipantInput, ParticipantPatch } from '../api/types';

const ruleKey = (person: ParticipantInput) => JSON.stringify(person.rules
  .map(rule => [rule.type, rule.targetParticipantId, rule.origin ?? ''])
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

// Identity and constraints determine the draw; display details can be patched.
// Compare rules without their UI order, while retaining history provenance.
export function peopleDiff(before: ParticipantInput[], after: ParticipantInput[]) {
  const original = new Map(before.map(person => [person.id, person]));
  const ids = new Set(after.map(person => person.id));
  const names = new Set<string>();
  const duplicateNames: string[] = [];
  for (const person of after) {
    const key = person.name.trim().toLowerCase();
    if (names.has(key)) duplicateNames.push(person.name);
    names.add(key);
  }
  const requiresRedraw = ids.size !== after.length || before.length !== after.length
    || after.some(person => !original.has(person.id) || ruleKey(person) !== ruleKey(original.get(person.id)!));
  const patches: ParticipantPatch[] = [];
  for (const person of after) {
    const previous = original.get(person.id);
    if (!previous) continue;
    const patch: ParticipantPatch = { id: person.id };
    if (person.name !== previous.name) patch.name = person.name;
    if (person.hint !== previous.hint) patch.hint = person.hint;
    if (person.email !== previous.email) patch.email = person.email;
    if (Object.keys(patch).length > 1) patches.push(patch);
  }
  return { requiresRedraw, patches, duplicateNames, changed: requiresRedraw || patches.length > 0 };
}
