import { Rule } from '../types';

export interface GroupSettings {
  message: string;
  budgetAmount: number | null; // cents
  budgetCurrency: string;      // ISO 4217
  eventDate: string | null;    // 'YYYY-MM-DD'
  timezone: string;            // IANA zone of the organiser, for reminder timing
  remindersEnabled: boolean;
  organiserEmail: string | null;
}

export interface ParticipantInput {
  id: string; // an existing server id, or any client-made id for someone new
  name: string;
  hint: string;
  email: string | null;
  rules: Rule[]; // targetParticipantId refers to ids in the same request
}

export interface CreateGroupRequest {
  settings: GroupSettings;
  participants: ParticipantInput[];
  turnstileToken: string;
}
export interface CreateGroupResponse { manageToken: string; participants: { id: string; link: string }[]; }

export type SendKind = 'link' | 'match_changed';
export type ReminderKind = 'reminder_7d' | 'reminder_1d';
export type LogKind = SendKind | ReminderKind | 'recovery';

export interface ManageParticipant {
  id: string;
  name: string;
  hint: string;
  email: string | null;
  rules: Rule[];
  link: string;
  opened: boolean;
  sent: Partial<Record<LogKind, string>>; // latest sent_at per kind that still applies
}

export interface ManageView {
  settings: GroupSettings;
  drawVersion: number;
  createdAt: string;
  expiresAt: string;
  participants: ManageParticipant[];
  emailEnabled: boolean;
}

export type SettingsPatch = Partial<GroupSettings>;
export interface ParticipantPatch { id: string; name?: string; hint?: string; email?: string | null; }
export interface PatchRequest { settings?: SettingsPatch; participants?: ParticipantPatch[]; }

export interface RedrawRequest { drawVersion: number; participants: ParticipantInput[]; confirm: boolean; }

export interface SendRequest { kind: SendKind; participantIds?: string[]; turnstileToken: string; }
export interface SendResult { participantId: string; ok: boolean; }
export interface SendResponse { results: SendResult[]; }

export interface RevealView {
  giverName: string;
  receiver: { name: string; hint: string; wishlist: string };
  ownWishlist: string;
  message: string;
  budgetAmount: number | null;
  budgetCurrency: string;
  eventDate: string | null;
  expiresAt: string;
}

export type ApiErrorCode =
  | 'invalid' | 'notFound' | 'forbidden' | 'tooLarge' | 'turnstile'
  | 'drawBlocked' | 'needsConfirm' | 'stale' | 'emailDisabled' | 'emailFailed';

export interface ApiError {
  error: ApiErrorCode;
  field?: string;
  stuckGiverIds?: string[];
  viewedCount?: number;
}

export interface ConfigResponse { emailEnabled: boolean; turnstileSiteKey: string; }
export type ExportFormat = 'history' | 'links' | 'json';
