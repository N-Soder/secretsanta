// The slice of Cloudflare D1 we use. Real D1 bindings satisfy it, and so does
// the node:sqlite shim in tests/helpers/d1.ts.
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1Stmt;
  // Runs the statements in one transaction.
  batch(statements: D1Stmt[]): Promise<unknown[]>;
}
