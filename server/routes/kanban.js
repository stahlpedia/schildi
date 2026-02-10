const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

// === Spalten-API ===

// Alle Spalten laden
router.get('/columns', (req, res) => {
  const columns = db.prepare('SELECT * FROM columns ORDER BY position ASC, id ASC').all();
  res.json(columns);
});

// Spalte erstellen
router.post('/columns', (req, res) => {
  const { name, label, color = 'border-gray-600' } = req.body;
  if (!name || !label) return res.status(400).json({ error: 'Name und Label erforderlich' });
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = db.prepare('SELECT id FROM columns WHERE name = ?').get(slug);
  if (existing) return res.status(409).json({ error: 'Spalte existiert bereits' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM columns').get();
  const result = db.prepare('INSERT INTO columns (name, label, color, position) VALUES (?, ?, ?, ?)').run(slug, label, color, (maxPos?.m || 0) + 1);
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(col);
});

// Spalten-Reihenfolge ändern (muss vor :id!)
router.put('/columns/reorder', (req, res) => {
  const { columns } = req.body;
  const stmt = db.prepare('UPDATE columns SET position=? WHERE id=?');
  const tx = db.transaction((items) => {
    for (const c of items) stmt.run(c.position, c.id);
  });
  tx(columns || []);
  res.json({ ok: true });
});

// Spalte updaten (umbenennen, Farbe, Position)
router.put('/columns/:id', (req, res) => {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Nicht gefunden' });
  const { label, color, position } = req.body;
  const oldName = col.name;
  db.prepare('UPDATE columns SET label=?, color=?, position=? WHERE id=?')
    .run(label ?? col.label, color ?? col.color, position ?? col.position, req.params.id);
  const updated = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Spalte löschen (verschiebt Karten nach backlog)
router.delete('/columns/:id', (req, res) => {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Nicht gefunden' });
  // Move cards to backlog before deleting
  db.prepare('UPDATE cards SET column_name = ? WHERE column_name = ?').run('backlog', col.name);
  db.prepare('DELETE FROM columns WHERE id = ?').run(req.params.id);
  res.json({ ok: true, movedCardsTo: 'backlog' });
});

// === Karten-API ===

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
