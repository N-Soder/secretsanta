import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/d1';

describe('schema', () => {
  it('deletes everything belonging to a group with the group', async () => {
    const db = createTestDb();
    await db.batch([
      db.prepare(`INSERT INTO groups (id, manage_token_hash, site_origin, timezone, created_at, expires_at) VALUES ('g', 'h', 'https://x', 'UTC', 'now', 'later')`),
      db.prepare(`INSERT INTO participants (id, group_id, name, link_token_hash, link_token_sealed) VALUES ('a', 'g', 'A', 'ha', 'sa'), ('b', 'g', 'B', 'hb', 'sb')`),
      db.prepare(`INSERT INTO rules (group_id, giver_id, target_id, type) VALUES ('g', 'a', 'b', 'mustNot')`),
      db.prepare(`INSERT INTO pairings (group_id, giver_id, receiver_id) VALUES ('g', 'a', 'b'), ('g', 'b', 'a')`),
      db.prepare(`INSERT INTO send_log (group_id, participant_id, kind, draw_version, sent_at) VALUES ('g', 'a', 'link', 1, 'now')`),
    ]);

    await db.prepare('DELETE FROM groups WHERE id = ?').bind('g').run();

    for (const table of ['participants', 'rules', 'pairings', 'send_log']) {
      expect(await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
    }
  });

  it('rolls back a failed batch', async () => {
    const db = createTestDb();
    await expect(db.batch([
      db.prepare(`INSERT INTO groups (id, manage_token_hash, site_origin, timezone, created_at, expires_at) VALUES ('g', 'h', 'o', 'UTC', 'n', 'l')`),
      db.prepare(`INSERT INTO groups (id, manage_token_hash, site_origin, timezone, created_at, expires_at) VALUES ('g', 'h', 'o', 'UTC', 'n', 'l')`),
    ])).rejects.toThrow();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM groups').first()).toEqual({ n: 0 });
  });
});
