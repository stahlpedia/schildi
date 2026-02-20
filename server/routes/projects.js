const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

// GET /api/projects — list all
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY id ASC').all();
  res.json(projects);
});

// GET /api/projects/:id — single project
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  res.json(project);
});

// POST /api/projects — create project (auto-creates default board + context folders)
router.post('/', (req, res) => {
  const { name, description = '', color = '#6366f1' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  const existing = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
  if (existing) return res.status(409).json({ error: 'Projekt mit diesem Namen existiert bereits' });

  const result = db.prepare('INSERT INTO projects (name, slug, description, color) VALUES (?, ?, ?, ?)')
    .run(name.trim(), slug, description, color);
  const projectId = result.lastInsertRowid;

  // Create default General board with columns
  const boardResult = db.prepare("INSERT INTO boards (project_id, name, slug, type) VALUES (?, ?, ?, ?)")
    .run(projectId, 'General', 'general', 'system');
  const boardId = boardResult.lastInsertRowid;
  const insertCol = db.prepare('INSERT INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)');
  insertCol.run('backlog', 'Backlog', 'border-gray-600', 1, boardId);
  insertCol.run('in-progress', 'In Progress', 'border-yellow-500', 2, boardId);
  insertCol.run('done', 'Done', 'border-emerald-500', 3, boardId);

  // Create default context folders
  db.prepare("INSERT INTO context_folders (project_id, name, type, is_system) VALUES (?, ?, ?, ?)")
    .run(projectId, 'Generiert', 'system', 1);
  db.prepare("INSERT INTO context_folders (project_id, name, type, is_system) VALUES (?, ?, ?, ?)")
    .run(projectId, 'Persönlicher Stock', 'system', 1);

  // Create default chat channel
  db.prepare("INSERT INTO chat_channels (project_id, name, slug, type, is_default) VALUES (?, ?, ?, ?, ?)")
    .run(projectId, 'Schildi', 'schildi', 'agent', 1);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  res.status(201).json(project);
});

// PUT /api/projects/:id — update
router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  const { name, description, color } = req.body;
  const slug = name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') : project.slug;

  db.prepare("UPDATE projects SET name=?, slug=?, description=?, color=?, updated_at=datetime('now') WHERE id=?")
    .run(name ?? project.name, slug, description ?? project.description, color ?? project.color, req.params.id);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/projects/:id — cascade delete
router.delete('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  // Prevent deleting the last project
  const count = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
  if (count <= 1) return res.status(400).json({ error: 'Das letzte Projekt kann nicht gelöscht werden' });

  const tx = db.transaction(() => {
    // Delete cards → columns → boards
    const boards = db.prepare('SELECT id FROM boards WHERE project_id = ?').all(req.params.id);
    for (const b of boards) {
      db.prepare('DELETE FROM cards WHERE board_id = ?').run(b.id);
      db.prepare('DELETE FROM columns WHERE board_id = ?').run(b.id);
    }
    db.prepare('DELETE FROM boards WHERE project_id = ?').run(req.params.id);

    // Delete social
    const folders = db.prepare('SELECT id FROM social_folders WHERE project_id = ?').all(req.params.id);
    for (const f of folders) {
      db.prepare('DELETE FROM social_asset_media WHERE asset_id IN (SELECT id FROM social_assets WHERE folder_id = ?)').run(f.id);
      db.prepare('DELETE FROM social_assets WHERE folder_id = ?').run(f.id);
    }
    db.prepare('DELETE FROM social_folders WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM social_channels WHERE project_id = ?').run(req.params.id);

    // Delete context folders + media_files
    db.prepare('DELETE FROM media_files WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM context_folders WHERE project_id = ?').run(req.params.id);

    // Delete pages
    const domains = db.prepare('SELECT id FROM pages_domains WHERE project_id = ?').all(req.params.id);
    for (const d of domains) {
      db.prepare('DELETE FROM page_media WHERE page_id IN (SELECT id FROM pages WHERE domain_id = ?)').run(d.id);
      db.prepare('DELETE FROM pages WHERE domain_id = ?').run(d.id);
    }
    db.prepare('DELETE FROM pages_domains WHERE project_id = ?').run(req.params.id);

    // Delete chat channels + conversations + messages
    const channels = db.prepare('SELECT id FROM chat_channels WHERE project_id = ?').all(req.params.id);
    for (const ch of channels) {
      const convos = db.prepare('SELECT id FROM conversations WHERE channel_id = ?').all(ch.id);
      for (const c of convos) {
        db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(c.id);
      }
      db.prepare('DELETE FROM conversations WHERE channel_id = ?').run(ch.id);
    }
    db.prepare('DELETE FROM chat_channels WHERE project_id = ?').run(req.params.id);

    // Delete project
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  });
  tx();

  res.json({ ok: true });
});

module.exports = router;
