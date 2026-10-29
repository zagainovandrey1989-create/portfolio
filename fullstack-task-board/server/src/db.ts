import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS boards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id    INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    assignee    TEXT,
    status      TEXT    NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')),
    position    INTEGER NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_board_status_position ON tasks (board_id, status, position);
  CREATE INDEX IF NOT EXISTS idx_tasks_board_assignee ON tasks (board_id, assignee);
  `,
];

/**
 * Opens (or creates) the SQLite database and applies pending migrations.
 * Pass ":memory:" for an ephemeral database (tests, e2e runs).
 */
export function openDatabase(filename: string): DB {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  if (filename !== ':memory:') db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const apply = db.transaction(() => {
    for (let version = current; version < MIGRATIONS.length; version++) {
      db.exec(MIGRATIONS[version]!);
    }
    db.pragma(`user_version = ${MIGRATIONS.length}`);
  });
  apply();
}
