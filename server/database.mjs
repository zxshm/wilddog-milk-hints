import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  if (!db.prepare('PRAGMA user_version').get().user_version) {
    const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
      db.exec('PRAGMA user_version=1; COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}

export function d1Adapter(db) {
  return { prepare(sql) { return { bind(...args) {
    const statement = db.prepare(sql);
    return { first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: statement.run(...args) }) };
  } }; } };
}
