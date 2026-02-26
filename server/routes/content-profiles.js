const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/projects/:projectId/content-profiles
router.get('/', (req, res) => {
  const pid = req.params.projectId;
  const profiles = db.prepare('SELECT * FROM content_profiles WHERE project_id = ? ORDER BY id ASC').all(pid);
  res.json(profiles);
});

// GET /api/projects/:projectId/content-profiles/:id
router.get('/:id', (req, res) => {
  const profile = db.prepare('SELECT * FROM content_profiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!profile) return res.status(404).json({ error: 'Profil nicht gefunden' });
  res.json(profile);
});

// POST /api/projects/:projectId/content-profiles
router.post('/', (req, res) => {
  const pid = req.params.projectId;
  const { name = 'Neues Profil', topics = [], target_audience = '', tone = '', notes = '' } = req.body;
  const result = db.prepare(
    "INSERT INTO content_profiles (project_id, name, topics, target_audience, tone, notes) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(pid, name, JSON.stringify(topics), target_audience, tone, notes);
  const profile = db.prepare('SELECT * FROM content_profiles WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(profile);
});

// PUT /api/projects/:projectId/content-profiles/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM content_profiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Profil nicht gefunden' });
  const { name, topics, target_audience, tone, notes } = req.body;
  db.prepare(
    "UPDATE content_profiles SET name = ?, topics = ?, target_audience = ?, tone = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(
    name ?? existing.name,
    topics ? JSON.stringify(topics) : existing.topics,
    target_audience ?? existing.target_audience,
    tone ?? existing.tone,
    notes ?? existing.notes,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM content_profiles WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/projects/:projectId/content-profiles/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM content_profiles WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Profil nicht gefunden' });
  db.prepare('DELETE FROM content_profiles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
