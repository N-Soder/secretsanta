-- Durable recipient operations. Payloads (including addresses and working links)
-- are AES-GCM sealed under LINK_KEY, and erased on success. All state cascades
-- with group deletion; participant operations also cascade when a person leaves.
-- slot deduplicates default/reminder sends and serialises pending explicit resends
-- and recoveries. Successful explicit operations release it for another resend.
CREATE TABLE email_operations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link','match_changed','reminder_7d','reminder_1d','recovery')),
  draw_version INTEGER NOT NULL,
  slot TEXT UNIQUE,
  explicit INTEGER NOT NULL DEFAULT 0 CHECK (explicit IN (0,1)),
  payload_sealed TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  lease_id TEXT,
  lease_until TEXT,
  sent_at TEXT,
  recovery_token_hash TEXT UNIQUE,
  previous_manage_hash TEXT,
  recovery_email TEXT
);
CREATE INDEX email_operations_group ON email_operations(group_id);
CREATE INDEX email_operations_pending ON email_operations(state, lease_until);
