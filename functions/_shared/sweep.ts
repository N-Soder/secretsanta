import { emailEnabled, type Env } from './env';
import { deleteExpired, reminderGroups } from './repo';
import { dueReminder } from './reminders';
import { sendToParticipants } from './sending';

export interface SweepResult {
  deletedGroups: number;
  // Recipient selections reported by the durable sender. An outstanding lease
  // or quarantined operation counts as unsuccessful, without a provider call.
  reminderAttempts: number;
  reminderSuccesses: number;
  reminderFailures: number;
  groupFailures: number;
}

export async function sweep(env: Env, now = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    deletedGroups: await deleteExpired(env.DB, now),
    reminderAttempts: 0, reminderSuccesses: 0, reminderFailures: 0, groupFailures: 0,
  };
  if (!emailEnabled(env)) return result;
  let afterId = '';
  for (;;) {
    const groups = await reminderGroups(env.DB, now, afterId);
    if (!groups.length) break;
    for (const group of groups) {
      afterId = group.id;
      try {
        const kind = dueReminder(group.event_date!, group.timezone, now);
        if (!kind) continue;
        const recipients = await sendToParticipants(env, group, kind);
        result.reminderAttempts += recipients.length;
        result.reminderSuccesses += recipients.filter(recipient => recipient.ok).length;
        result.reminderFailures += recipients.filter(recipient => !recipient.ok).length;
      } catch {
        // Never include an exception, token, address or provider body in logs.
        // Durable leases make interrupted delivery safe to resume next hour.
        result.groupFailures++;
      }
    }
  }
  return result;
}
