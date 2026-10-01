import schema from '../../migrations/0001_init.sql?raw';
import type { D1Like, D1Stmt } from '../../functions/_shared/db';

// node:sqlite is loaded through getBuiltinModule so neither Vite nor tsc needs to resolve it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DatabaseSync } = (globalThis as any).process.getBuiltinModule('node:sqlite');

type Raw = { prepare(sql: string): { get(...a: unknown[]): any; all(...a: unknown[]): any[]; run(...a: unknown[]): { changes: number | bigint } }; exec(sql: string): void };

function toSqlite(values: unknown[]) {
  return values.map(value => value === undefined ? null : typeof value === 'boolean' ? (value ? 1 : 0) : value);
}

// Rows from node:sqlite have a null prototype; copy them so toEqual behaves.
const plain = <T>(row: unknown): T => (row ? { ...(row as object) } : row) as T;

class Stmt implements D1Stmt {
  constructor(private readonly db: Raw, readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...values: unknown[]) { return new Stmt(this.db, this.sql, values); }
  async first<T>() { return plain<T>(this.db.prepare(this.sql).get(...toSqlite(this.params))) ?? null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...toSqlite(this.params)).map(row => plain<T>(row)) }; }
  async run() { return { meta: { changes: Number(this.runNow().changes) } }; }
  runNow() { return this.db.prepare(this.sql).run(...toSqlite(this.params)); }
}

export type TestDb = D1Like & { raw: Raw };

export function createTestDb(): TestDb {
  const db: Raw = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);
  return {
    raw: db,
    prepare: sql => new Stmt(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => (statement as Stmt).runNow());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
