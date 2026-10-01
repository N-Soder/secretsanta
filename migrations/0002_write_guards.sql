-- Optimistic edit revisions. The guard row exists only inside a batch;
-- a failed CHECK aborts that batch before any draw or participant changes.
ALTER TABLE groups ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE write_guards (
  group_id TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  version_ok INTEGER NOT NULL CHECK (version_ok = 1),
  views_ok INTEGER NOT NULL CHECK (views_ok = 1)
);
