// Test-only stand-in for `expo-sqlite`, backed by node's built-in SQLite, so the real db/database.js
// (schema, migrations, queries) can be exercised under node. Not bundled into the app.
import { DatabaseSync } from 'node:sqlite';

export async function openDatabaseAsync() {
  const d = globalThis.__honyaTestDb ?? (globalThis.__honyaTestDb = new DatabaseSync(':memory:'));
  return {
    execAsync: async (sql) => d.exec(sql),
    runAsync: async (sql, params = []) => {
      const r = d.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
    },
    getAllAsync: async (sql, params = []) => d.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => d.prepare(sql).get(...params) ?? null,
    withTransactionAsync: async (fn) => {
      d.exec('BEGIN');
      try {
        await fn();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
