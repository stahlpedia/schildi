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

  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'custom',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'border-gray-600',
    position INTEGER DEFAULT 0,
    board_id INTEGER,
    UNIQUE(name, board_id)
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    column_name TEXT NOT NULL DEFAULT 'backlog',
    labels TEXT DEFAULT '[]',
    position INTEGER DEFAULT 0,
    board_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    category TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    has_unanswered INTEGER DEFAULT 0,
    agent_unread INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 3000,
    api_key TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    author TEXT NOT NULL CHECK(author IN ('user', 'agent')),
    text TEXT NOT NULL,
    task_ref INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
`);

// Migrate: add agent_unread column if missing
try {
  db.prepare('SELECT agent_unread FROM conversations LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE conversations ADD COLUMN agent_unread INTEGER DEFAULT 0');
}

// Migrate: add public_url column to domains if missing
try {
  db.prepare('SELECT public_url FROM domains LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE domains ADD COLUMN public_url TEXT DEFAULT ''");
}

// Migrate: add board_id column to columns if missing
try {
  db.prepare('SELECT board_id FROM columns LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE columns ADD COLUMN board_id INTEGER');
}

// Migrate: rebuild columns table to fix UNIQUE constraint (name → name+board_id)
try {
  // Check if old UNIQUE(name) constraint exists by trying a duplicate name with different board_id
  // We do this by checking the SQL schema
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='columns'").get();
  if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('UNIQUE(name, board_id)') && !tableInfo.sql.includes('UNIQUE( name, board_id )')) {
    db.exec(`
      CREATE TABLE columns_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        label TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'border-gray-600',
        position INTEGER DEFAULT 0,
        board_id INTEGER,
        UNIQUE(name, board_id)
      );
      INSERT INTO columns_new SELECT id, name, label, color, position, board_id FROM columns;
      DROP TABLE columns;
      ALTER TABLE columns_new RENAME TO columns;
    `);
  }
} catch (e) {
  console.warn('Column constraint migration skipped:', e.message);
}

// Migrate: add board_id column to cards if missing
try {
  db.prepare('SELECT board_id FROM cards LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE cards ADD COLUMN board_id INTEGER');
}

// Seed default boards if empty
const boardCount = db.prepare('SELECT COUNT(*) as c FROM boards').get();
if (boardCount.c === 0) {
  db.prepare("INSERT INTO boards (name, slug, type) VALUES (?, ?, ?)").run('General', 'general', 'system');
  db.prepare("INSERT INTO boards (name, slug, type) VALUES (?, ?, ?)").run('Pages', 'pages', 'system');
}

// Get the General board id for migration and seeding
const generalBoard = db.prepare("SELECT id FROM boards WHERE slug = 'general'").get();
const generalBoardId = generalBoard ? generalBoard.id : 1;

// Migrate existing columns and cards without a board_id to General board
db.prepare('UPDATE columns SET board_id = ? WHERE board_id IS NULL').run(generalBoardId);
db.prepare('UPDATE cards SET board_id = ? WHERE board_id IS NULL').run(generalBoardId);

// Seed default columns if empty
const colCount = db.prepare('SELECT COUNT(*) as c FROM columns').get();
if (colCount.c === 0) {
  const insert = db.prepare('INSERT INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)');
  insert.run('backlog', 'Backlog', 'border-gray-600', 1, generalBoardId);
  insert.run('in-progress', 'In Progress', 'border-yellow-500', 2, generalBoardId);
  insert.run('done', 'Done', 'border-emerald-500', 3, generalBoardId);
}

// Ensure Pages board has default columns
const pagesBoard = db.prepare("SELECT id FROM boards WHERE slug = 'pages'").get();
if (pagesBoard) {
  const pagesColCount = db.prepare('SELECT COUNT(*) as c FROM columns WHERE board_id = ?').get(pagesBoard.id);
  if (pagesColCount.c === 0) {
    const insertCol = db.prepare('INSERT OR IGNORE INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)');
    insertCol.run('backlog', 'Backlog', 'border-gray-600', 1, pagesBoard.id);
    insertCol.run('in-progress', 'In Progress', 'border-yellow-500', 2, pagesBoard.id);
    insertCol.run('done', 'Done', 'border-emerald-500', 3, pagesBoard.id);
  }
}

// Migrate: ensure system boards have correct type
db.prepare("UPDATE boards SET type = 'system' WHERE slug IN ('general', 'pages') AND type != 'system'").run();

// Migrate: add type and model_id columns to conversations if missing
try {
  db.prepare('SELECT type FROM conversations LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'agent'");
}
try {
  db.prepare('SELECT model_id FROM conversations LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE conversations ADD COLUMN model_id TEXT DEFAULT ''");
}

module.exports = db;
