-- Secret Santa groups. Everything hangs off groups and is deleted with it.
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  manage_token_hash TEXT NOT NULL UNIQUE,
  site_origin TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  budget_amount INTEGER,
  budget_currency TEXT NOT NULL DEFAULT 'AUD',
  event_date TEXT,
  timezone TEXT NOT NULL,
  reminders_enabled INTEGER NOT NULL DEFAULT 0,
  organiser_email TEXT,
  draw_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  email TEXT,
  link_token_hash TEXT NOT NULL UNIQUE,
  link_token_sealed TEXT NOT NULL,
  wishlist TEXT NOT NULL DEFAULT '',
  first_viewed_at TEXT
);

CREATE TABLE rules (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  giver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('must', 'mustNot')),
  origin TEXT CHECK (origin IN ('history')),
  PRIMARY KEY (giver_id, target_id)
);

CREATE TABLE pairings (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  giver_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE
);

CREATE TABLE send_log (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'match_changed', 'reminder_7d', 'reminder_1d', 'recovery')),
  draw_version INTEGER NOT NULL,
  sent_at TEXT NOT NULL
);

CREATE INDEX participants_group ON participants(group_id);
CREATE INDEX rules_group ON rules(group_id);
CREATE INDEX pairings_group ON pairings(group_id);
CREATE INDEX send_log_group ON send_log(group_id, kind);
CREATE INDEX groups_expires ON groups(expires_at);
CREATE INDEX groups_reminders ON groups(event_date) WHERE reminders_enabled = 1;
CREATE INDEX groups_organiser_email ON groups(organiser_email COLLATE NOCASE);
