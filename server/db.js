const Database = require('better-sqlite3');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'schildi.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    column_name TEXT NOT NULL DEFAULT 'backlog',
    labels TEXT DEFAULT '[]',
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    category TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
