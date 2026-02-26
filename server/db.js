const Database = require('better-sqlite3');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'schildi.db'));

db.pragma('journal_mode = WAL');
// Foreign keys enabled after migration
db.pragma('foreign_keys = OFF');

// ============================================================
// NEW SCHEMA (Project-based architecture)
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(slug, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'border-gray-600',
    position INTEGER DEFAULT 0,
    UNIQUE(name, board_id),
    FOREIGN KEY (board_id) REFERENCES boards(id)
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    column_name TEXT NOT NULL DEFAULT 'backlog',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    labels TEXT DEFAULT '[]',
    position INTEGER DEFAULT 0,
    due_date TEXT,
    due_time TEXT,
    on_hold INTEGER DEFAULT 0,
    result TEXT,
    social_asset_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (board_id) REFERENCES boards(id)
  );

  CREATE TABLE IF NOT EXISTS social_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS social_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (parent_id) REFERENCES social_folders(id)
  );

  CREATE TABLE IF NOT EXISTS social_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    image_prompt TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    target_channels TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (folder_id) REFERENCES social_folders(id)
  );

  CREATE TABLE IF NOT EXISTS social_asset_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    media_file_id INTEGER NOT NULL,
    type TEXT DEFAULT 'image',
    position INTEGER DEFAULT 0,
    FOREIGN KEY (asset_id) REFERENCES social_assets(id),
    FOREIGN KEY (media_file_id) REFERENCES media_files(id)
  );

  CREATE TABLE IF NOT EXISTS context_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'custom',
    parent_id INTEGER,
    is_system INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    folder_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    tags TEXT DEFAULT '[]',
    alt_text TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (folder_id) REFERENCES context_folders(id)
  );

  CREATE TABLE IF NOT EXISTS pages_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(domain_id, slug),
    FOREIGN KEY (domain_id) REFERENCES pages_domains(id)
  );

  CREATE TABLE IF NOT EXISTS page_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    media_file_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (page_id) REFERENCES pages(id),
    FOREIGN KEY (media_file_id) REFERENCES media_files(id)
  );

  CREATE TABLE IF NOT EXISTS chat_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'agent',
    model_id TEXT DEFAULT '',
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(slug, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    has_unanswered INTEGER DEFAULT 0,
    agent_unread INTEGER DEFAULT 0,
    channel_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('card', 'message')),
    entity_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    category TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'social',
    html TEXT NOT NULL DEFAULT '',
    css TEXT NOT NULL DEFAULT '',
    fields TEXT DEFAULT '[]',
    width INTEGER DEFAULT 1080,
    height INTEGER DEFAULT 1080,
    is_default INTEGER DEFAULT 0,
    preview_data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS page_passwords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    username TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(domain, path)
  );
`);

// ============================================================
// MIGRATION from old schema
// ============================================================

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnExists(table, col) {
  try {
    db.prepare(`SELECT ${col} FROM ${table} LIMIT 0`).run();
    return true;
  } catch { return false; }
}

// --- Ensure a default project exists ---
let defaultProject = db.prepare("SELECT * FROM projects WHERE slug = 'schildi-dashboard'").get();
if (!defaultProject) {
  db.prepare("INSERT INTO projects (name, slug, description, color) VALUES (?, ?, ?, ?)")
    .run('Schildi Dashboard', 'schildi-dashboard', 'Standard-Projekt', '#6366f1');
  defaultProject = db.prepare("SELECT * FROM projects WHERE slug = 'schildi-dashboard'").get();
}
const DEFAULT_PROJECT_ID = defaultProject.id;

// --- Migrate boards: add project_id if missing ---
if (!columnExists('boards', 'project_id')) {
  // Old schema — boards without project_id
  db.exec(`ALTER TABLE boards ADD COLUMN project_id INTEGER`);
  db.prepare('UPDATE boards SET project_id = ? WHERE project_id IS NULL').run(DEFAULT_PROJECT_ID);
}
// Ensure all boards have project_id
db.prepare('UPDATE boards SET project_id = ? WHERE project_id IS NULL').run(DEFAULT_PROJECT_ID);

// --- Rebuild boards table to fix UNIQUE constraint (slug → slug+project_id) ---
try {
  const boardsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='boards'").get();
  if (boardsInfo && boardsInfo.sql && !boardsInfo.sql.includes('UNIQUE(slug, project_id)') && !boardsInfo.sql.includes('UNIQUE( slug, project_id )')) {
    db.exec(`
      CREATE TABLE boards_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'custom',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(slug, project_id)
      );
      INSERT INTO boards_new SELECT id, project_id, name, slug, type, created_at FROM boards;
      DROP TABLE boards;
      ALTER TABLE boards_new RENAME TO boards;
    `);
  }
} catch (e) {
  console.warn('Boards constraint migration skipped:', e.message);
}

// --- Migrate columns: ensure board_id exists ---
if (!columnExists('columns', 'board_id')) {
  db.exec('ALTER TABLE columns ADD COLUMN board_id INTEGER');
}

// --- Migrate cards: ensure board_id, due_date, on_hold, result, due_time, social_asset_id ---
if (!columnExists('cards', 'board_id')) {
  db.exec('ALTER TABLE cards ADD COLUMN board_id INTEGER');
}
if (!columnExists('cards', 'due_date')) {
  db.exec('ALTER TABLE cards ADD COLUMN due_date TEXT');
}
if (!columnExists('cards', 'due_time')) {
  db.exec('ALTER TABLE cards ADD COLUMN due_time TEXT');
}
if (!columnExists('cards', 'on_hold')) {
  db.exec('ALTER TABLE cards ADD COLUMN on_hold INTEGER DEFAULT 0');
}
if (!columnExists('cards', 'result')) {
  db.exec('ALTER TABLE cards ADD COLUMN result TEXT');
}
if (!columnExists('cards', 'social_asset_id')) {
  db.exec('ALTER TABLE cards ADD COLUMN social_asset_id INTEGER');
}

// --- Migrate chat_channels: add project_id if missing ---
if (!columnExists('chat_channels', 'project_id')) {
  db.exec('ALTER TABLE chat_channels ADD COLUMN project_id INTEGER');
  db.prepare('UPDATE chat_channels SET project_id = ? WHERE project_id IS NULL').run(DEFAULT_PROJECT_ID);
}
db.prepare('UPDATE chat_channels SET project_id = ? WHERE project_id IS NULL').run(DEFAULT_PROJECT_ID);

// --- Rebuild chat_channels table to fix UNIQUE constraint (slug → slug+project_id) ---
try {
  const chInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_channels'").get();
  if (chInfo && chInfo.sql && !chInfo.sql.includes('UNIQUE(slug, project_id)') && !chInfo.sql.includes('UNIQUE( slug, project_id )')) {
    db.exec(`
      CREATE TABLE chat_channels_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'agent',
        model_id TEXT DEFAULT '',
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(slug, project_id)
      );
      INSERT INTO chat_channels_new SELECT id, project_id, name, slug, type, model_id, is_default, created_at FROM chat_channels;
      DROP TABLE chat_channels;
      ALTER TABLE chat_channels_new RENAME TO chat_channels;
    `);
  }
} catch (e) {
  console.warn('Chat channels constraint migration skipped:', e.message);
}

// --- Migrate conversations ---
if (!columnExists('conversations', 'agent_unread')) {
  db.exec('ALTER TABLE conversations ADD COLUMN agent_unread INTEGER DEFAULT 0');
}
if (!columnExists('conversations', 'channel_id')) {
  db.exec('ALTER TABLE conversations ADD COLUMN channel_id INTEGER');
}

// --- Migrate media_folders → context_folders ---
if (tableExists('media_folders')) {
  // Check if we already migrated
  const contextFolderCount = db.prepare('SELECT COUNT(*) as c FROM context_folders').get().c;
  if (contextFolderCount === 0) {
    const oldFolders = db.prepare('SELECT * FROM media_folders').all();
    const folderIdMap = {};
    for (const f of oldFolders) {
      const result = db.prepare(
        "INSERT INTO context_folders (project_id, name, type, parent_id, is_system, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(DEFAULT_PROJECT_ID, f.name, f.is_system ? 'system' : 'custom', f.parent_id ? (folderIdMap[f.parent_id] || null) : null, f.is_system || 0, 0, f.created_at || new Date().toISOString());
      folderIdMap[f.id] = result.lastInsertRowid;
    }

    // Migrate media_files: add project_id, remap folder_id
    if (columnExists('media_files', 'folder_id')) {
      // Add project_id if missing
      if (!columnExists('media_files', 'project_id')) {
        db.exec('ALTER TABLE media_files ADD COLUMN project_id INTEGER');
      }
      const oldFiles = db.prepare('SELECT * FROM media_files').all();
      for (const f of oldFiles) {
        const newFolderId = folderIdMap[f.folder_id] || null;
        if (newFolderId) {
          db.prepare('UPDATE media_files SET folder_id = ?, project_id = ? WHERE id = ?')
            .run(newFolderId, DEFAULT_PROJECT_ID, f.id);
        } else {
          db.prepare('UPDATE media_files SET project_id = ? WHERE id = ?')
            .run(DEFAULT_PROJECT_ID, f.id);
        }
      }
    }
  }
  // Drop old table
  db.exec('DROP TABLE IF EXISTS media_folders');
}

// Ensure media_files has project_id (for fresh installs where media_folders didn't exist)
if (!columnExists('media_files', 'project_id')) {
  db.exec('ALTER TABLE media_files ADD COLUMN project_id INTEGER');
  db.prepare('UPDATE media_files SET project_id = ? WHERE project_id IS NULL').run(DEFAULT_PROJECT_ID);
}

// --- Migrate settings: ensure created_at, updated_at ---
if (!columnExists('settings', 'created_at')) {
  db.exec('ALTER TABLE settings ADD COLUMN created_at TEXT');
}
if (!columnExists('settings', 'updated_at')) {
  db.exec('ALTER TABLE settings ADD COLUMN updated_at TEXT');
}

// --- Add channel_id to social_folders ---
try { db.prepare('SELECT channel_id FROM social_folders LIMIT 1').get(); }
catch { db.exec('ALTER TABLE social_folders ADD COLUMN channel_id INTEGER'); }

// --- Drop social_posts ---
db.exec('DROP TABLE IF EXISTS social_posts');

// ============================================================
// SEEDING
// ============================================================

// Seed default boards if empty
const boardCount = db.prepare('SELECT COUNT(*) as c FROM boards').get();
if (boardCount.c === 0) {
  db.prepare("INSERT INTO boards (project_id, name, slug, type) VALUES (?, ?, ?, ?)").run(DEFAULT_PROJECT_ID, 'General', 'general', 'system');
  db.prepare("INSERT INTO boards (project_id, name, slug, type) VALUES (?, ?, ?, ?)").run(DEFAULT_PROJECT_ID, 'Pages', 'pages', 'system');
}

// Get the General board id
const generalBoard = db.prepare("SELECT id FROM boards WHERE slug = 'general' AND project_id = ?").get(DEFAULT_PROJECT_ID);
const generalBoardId = generalBoard ? generalBoard.id : db.prepare("SELECT id FROM boards ORDER BY id ASC LIMIT 1").get()?.id || 1;

// Migrate existing columns and cards without a board_id
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
const pagesBoard = db.prepare("SELECT id FROM boards WHERE slug = 'pages' AND project_id = ?").get(DEFAULT_PROJECT_ID);
if (pagesBoard) {
  const pagesColCount = db.prepare('SELECT COUNT(*) as c FROM columns WHERE board_id = ?').get(pagesBoard.id);
  if (pagesColCount.c === 0) {
    const insertCol = db.prepare('INSERT OR IGNORE INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)');
    insertCol.run('backlog', 'Backlog', 'border-gray-600', 1, pagesBoard.id);
    insertCol.run('in-progress', 'In Progress', 'border-yellow-500', 2, pagesBoard.id);
    insertCol.run('done', 'Done', 'border-emerald-500', 3, pagesBoard.id);
  }
}

// Ensure system boards have correct type
db.prepare("UPDATE boards SET type = 'system' WHERE slug IN ('general', 'pages') AND type != 'system'").run();

// Seed default Schildi channel if empty
const chatChannelCount = db.prepare('SELECT COUNT(*) as c FROM chat_channels').get();
if (chatChannelCount.c === 0) {
  db.prepare("INSERT INTO chat_channels (project_id, name, slug, type, model_id, is_default) VALUES (?, ?, ?, ?, ?, ?)").run(DEFAULT_PROJECT_ID, 'Schildi', 'schildi', 'agent', '', 1);
}

// Assign orphan conversations to the default channel
const defaultChannel = db.prepare("SELECT id FROM chat_channels WHERE is_default = 1").get();
if (defaultChannel) {
  db.prepare('UPDATE conversations SET channel_id = ? WHERE channel_id IS NULL').run(defaultChannel.id);
}

// Seed default context folders if empty
const ctxFolderCount = db.prepare('SELECT COUNT(*) as c FROM context_folders').get();
if (ctxFolderCount.c === 0) {
  db.prepare("INSERT INTO context_folders (project_id, name, type, is_system, category) VALUES (?, ?, ?, ?, ?)").run(DEFAULT_PROJECT_ID, 'Generiert', 'system', 1, 'content');
  db.prepare("INSERT INTO context_folders (project_id, name, type, is_system, category) VALUES (?, ?, ?, ?, ?)").run(DEFAULT_PROJECT_ID, 'Persönlicher Stock', 'system', 1, 'context');
}

// Seed default templates if empty
const templateCount = db.prepare('SELECT COUNT(*) as c FROM templates').get();
if (templateCount.c === 0) {
  const insertTpl = db.prepare(`INSERT INTO templates (project_id, name, category, html, css, fields, width, height, is_default, preview_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  insertTpl.run(DEFAULT_PROJECT_ID, 'Zitat-Karte', 'social',
    `<div class="card">
  <div class="quote">"{{quote}}"</div>
  <div class="author">{{author}}</div>
  <div class="watermark">🐢 schildi.ai</div>
</div>`,
    `.card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, {{brandColor|#6366f1}} 0%, #1a1a2e 100%);
  padding: 80px;
  box-sizing: border-box;
  font-family: 'Noto Sans', sans-serif;
  color: #ffffff;
  position: relative;
}
.quote {
  font-size: 48px;
  text-align: center;
  line-height: 1.3;
  margin-bottom: 40px;
}
.author {
  font-size: 32px;
  font-weight: 700;
  color: rgba(255,255,255,0.56);
  text-align: center;
}
.watermark {
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 24px;
  color: rgba(255,255,255,0.37);
  font-weight: 600;
}`,
    JSON.stringify([
      {name: "quote", type: "text", label: "Zitat"},
      {name: "author", type: "text", label: "Autor"},
      {name: "brandColor", type: "color", label: "Farbe", default: "#6366f1"}
    ]),
    1080, 1080, 1,
    JSON.stringify({quote: "Führung heißt, Menschen zu befähigen.", author: "Thomas C. Stahl", brandColor: "#6366f1"})
  );

  insertTpl.run(DEFAULT_PROJECT_ID, 'Text-Karte', 'social',
    `<div class="card">
  <div class="title">{{title}}</div>
  <div class="body">{{body}}</div>
  <div class="watermark">🐢 schildi.ai</div>
</div>`,
    `.card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: #1a1a2e;
  padding: 80px;
  box-sizing: border-box;
  font-family: 'Noto Sans', sans-serif;
  color: #ffffff;
  position: relative;
}
.title {
  font-size: 64px;
  font-weight: 700;
  color: {{brandColor|#ef4444}};
  text-align: center;
  margin-bottom: 40px;
  line-height: 1.1;
}
.body {
  font-size: 36px;
  text-align: center;
  line-height: 1.4;
}
.watermark {
  position: absolute;
  bottom: 40px;
  right: 40px;
  font-size: 24px;
  color: rgba(255,255,255,0.37);
  font-weight: 600;
}`,
    JSON.stringify([
      {name: "title", type: "text", label: "Titel"},
      {name: "body", type: "textarea", label: "Text"},
      {name: "brandColor", type: "color", label: "Farbe", default: "#ef4444"}
    ]),
    1080, 1080, 1,
    JSON.stringify({title: "KI-Führung", body: "Dein wöchentliches Briefing", brandColor: "#ef4444"})
  );
}

// --- Migration: Add category column to context_folders ---
try {
  db.prepare("SELECT category FROM context_folders LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE context_folders ADD COLUMN category TEXT DEFAULT 'content'").run();
  // Set "Persönlicher Stock" folders to context category
  db.prepare("UPDATE context_folders SET category = 'context' WHERE name = 'Persönlicher Stock'").run();
  // Set "Generiert" folders to content category
  db.prepare("UPDATE context_folders SET category = 'content' WHERE name = 'Generiert'").run();
}

// --- Migration: content_channels table ---
try {
  db.prepare("SELECT id FROM content_channels LIMIT 1").get();
} catch {
  db.exec(`CREATE TABLE IF NOT EXISTS content_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
}

// --- Migration: channel_id on context_folders ---
try {
  db.prepare("SELECT channel_id FROM context_folders LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE context_folders ADD COLUMN channel_id INTEGER");
}

// --- Migration: content_profiles table ---
try {
  db.prepare("SELECT id FROM content_profiles LIMIT 1").get();
} catch {
  db.exec(`CREATE TABLE content_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Standard',
    topics TEXT DEFAULT '[]',
    target_audience TEXT DEFAULT '',
    tone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
}

// --- Migration: context_textfiles table ---
try {
  db.prepare("SELECT id FROM context_textfiles LIMIT 1").get();
} catch {
  db.exec(`CREATE TABLE context_textfiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    folder_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (folder_id) REFERENCES context_folders(id)
  )`);
}

// --- Migration: Move "Persönlicher Stock" from context to content ---
db.prepare("UPDATE context_folders SET category = 'content' WHERE name = 'Persönlicher Stock' AND category = 'context'").run();

// Enable foreign keys after all migrations are done
db.pragma('foreign_keys = ON');

// Export db + default project id
db.DEFAULT_PROJECT_ID = DEFAULT_PROJECT_ID;
module.exports = db;
