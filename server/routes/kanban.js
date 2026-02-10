const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

// Alle Karten laden
router.get('/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY position ASC, id ASC').all();
  res.json(cards.map(c => ({ ...c, labels: JSON.parse(c.labels || '[]') })));
});

// Alias für /tasks (für meine API-Calls)
router.get('/tasks', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY position ASC, id ASC').all();
  res.json(cards.map(c => ({ ...c, labels: JSON.parse(c.labels || '[]') })));
});

// Bulk-Reorder (muss vor :id kommen!)
router.put('/cards/reorder', (req, res) => {
  const { cards } = req.body;
  const stmt = db.prepare("UPDATE cards SET column_name=?, position=?, updated_at=datetime('now') WHERE id=?");
  const tx = db.transaction((items) => {
    for (const c of items) stmt.run(c.column_name, c.position, c.id);
  });
  tx(cards || []);
  res.json({ ok: true });
});

// Task alias für POST
router.post('/tasks', (req, res) => {
  const { title, description = '', status = 'backlog', labels = [] } = req.body;
  if (!title) return res.status(400).json({ error: 'Titel erforderlich' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ?').get(status);
  const result = db.prepare(
    'INSERT INTO cards (title, description, column_name, labels, position) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description, status, JSON.stringify(labels), (maxPos?.m || 0) + 1);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...card, labels: JSON.parse(card.labels), status: card.column_name });
});

// Neue Karte
router.post('/cards', (req, res) => {
  const { title, description = '', column_name = 'backlog', labels = [] } = req.body;
  if (!title) return res.status(400).json({ error: 'Titel erforderlich' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ?').get(column_name);
  const result = db.prepare(
    'INSERT INTO cards (title, description, column_name, labels, position) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description, column_name, JSON.stringify(labels), (maxPos?.m || 0) + 1);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...card, labels: JSON.parse(card.labels) });
});

// Karte updaten
router.put('/cards/:id', (req, res) => {
  const { title, description, column_name, labels, position } = req.body;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Nicht gefunden' });

  db.prepare(`UPDATE cards SET title=?, description=?, column_name=?, labels=?, position=?, updated_at=datetime('now') WHERE id=?`)
    .run(
      title ?? card.title,
      description ?? card.description,
      column_name ?? card.column_name,
      JSON.stringify(labels ?? JSON.parse(card.labels)),
      position ?? card.position,
      req.params.id
    );
  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  res.json({ ...updated, labels: JSON.parse(updated.labels) });
});

// Karte löschen
router.delete('/cards/:id', (req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
