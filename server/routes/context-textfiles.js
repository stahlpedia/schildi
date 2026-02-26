const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/projects/:projectId/context/folders/:folderId/textfiles
router.get('/', (req, res) => {
  const { projectId, folderId } = req.params;
  const files = db.prepare(
    'SELECT id, filename, created_at, updated_at FROM context_textfiles WHERE project_id = ? AND folder_id = ? ORDER BY filename ASC'
  ).all(projectId, folderId);
  res.json(files);
});

// POST /api/projects/:projectId/context/folders/:folderId/textfiles
router.post('/', (req, res) => {
  const { projectId, folderId } = req.params;
  let { filename, content = '' } = req.body;
  if (!filename?.trim()) return res.status(400).json({ error: 'Dateiname erforderlich' });
  if (!filename.endsWith('.md')) filename = filename + '.md';
  
  const existing = db.prepare('SELECT id FROM context_textfiles WHERE project_id = ? AND folder_id = ? AND filename = ?').get(projectId, folderId, filename);
  if (existing) return res.status(409).json({ error: 'Datei existiert bereits' });

  const result = db.prepare(
    "INSERT INTO context_textfiles (project_id, folder_id, filename, content) VALUES (?, ?, ?, ?)"
  ).run(projectId, folderId, filename, content);
  const file = db.prepare('SELECT * FROM context_textfiles WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(file);
});

// GET /api/projects/:projectId/context/textfiles/:id
router.get('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM context_textfiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  res.json(file);
});

// PUT /api/projects/:projectId/context/textfiles/:id
router.put('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM context_textfiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const { filename, content } = req.body;
  db.prepare(
    "UPDATE context_textfiles SET filename = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(filename ?? file.filename, content ?? file.content, req.params.id);
  const updated = db.prepare('SELECT * FROM context_textfiles WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/projects/:projectId/context/textfiles/:id
router.delete('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM context_textfiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  db.prepare('DELETE FROM context_textfiles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
