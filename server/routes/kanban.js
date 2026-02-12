const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://openclaw:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

const router = Router();
router.use(authenticate);

// === Boards-API ===

router.get('/boards', (req, res) => {
  const boards = db.prepare('SELECT * FROM boards ORDER BY id ASC').all();
  res.json(boards);
});

router.post('/boards', (req, res) => {
  const { name, type = 'custom' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = db.prepare('SELECT id FROM boards WHERE slug = ?').get(slug);
  if (existing) return res.status(409).json({ error: 'Board existiert bereits' });
  const result = db.prepare('INSERT INTO boards (name, slug, type) VALUES (?, ?, ?)').run(name, slug, type);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(result.lastInsertRowid);
  // Seed default columns for the new board
  const insert = db.prepare('INSERT INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)');
  insert.run('backlog', 'Backlog', 'border-gray-600', 1, board.id);
  insert.run('in-progress', 'In Progress', 'border-yellow-500', 2, board.id);
  insert.run('done', 'Done', 'border-emerald-500', 3, board.id);
  res.status(201).json(board);
});

router.put('/boards/:id', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name } = req.body;
  const slug = name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : board.slug;
  db.prepare('UPDATE boards SET name=?, slug=? WHERE id=?').run(name ?? board.name, slug, req.params.id);
  const updated = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/boards/:id', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Nicht gefunden' });
  if (board.type !== 'custom') return res.status(400).json({ error: 'System-Boards können nicht gelöscht werden' });
  const cardCount = db.prepare('SELECT COUNT(*) as c FROM cards WHERE board_id = ?').get(req.params.id);
  if (cardCount.c > 0) {
    const generalBoard = db.prepare("SELECT id FROM boards WHERE slug = 'general'").get();
    if (generalBoard) {
      db.prepare('UPDATE cards SET board_id = ? WHERE board_id = ?').run(generalBoard.id, req.params.id);
    }
  }
  db.prepare('DELETE FROM columns WHERE board_id = ?').run(req.params.id);
  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// === Spalten-API ===

router.get('/columns', (req, res) => {
  const { board_id } = req.query;
  let columns;
  if (board_id) {
    columns = db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC, id ASC').all(board_id);
  } else {
    columns = db.prepare('SELECT * FROM columns ORDER BY position ASC, id ASC').all();
  }
  res.json(columns);
});

router.post('/columns', (req, res) => {
  const { name, label, color = 'border-gray-600', board_id } = req.body;
  if (!name || !label) return res.status(400).json({ error: 'Name und Label erforderlich' });
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = db.prepare('SELECT id FROM columns WHERE name = ? AND board_id = ?').get(slug, board_id || null);
  if (existing) return res.status(409).json({ error: 'Spalte existiert bereits' });
  const maxPos = board_id
    ? db.prepare('SELECT COALESCE(MAX(position),0) as m FROM columns WHERE board_id = ?').get(board_id)
    : db.prepare('SELECT COALESCE(MAX(position),0) as m FROM columns').get();
  const result = db.prepare('INSERT INTO columns (name, label, color, position, board_id) VALUES (?, ?, ?, ?, ?)').run(slug, label, color, (maxPos?.m || 0) + 1, board_id || null);
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(col);
});

router.put('/columns/reorder', (req, res) => {
  const { columns } = req.body;
  const stmt = db.prepare('UPDATE columns SET position=? WHERE id=?');
  const tx = db.transaction((items) => {
    for (const c of items) stmt.run(c.position, c.id);
  });
  tx(columns || []);
  res.json({ ok: true });
});

router.put('/columns/:id', (req, res) => {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Nicht gefunden' });
  const { label, color, position } = req.body;
  db.prepare('UPDATE columns SET label=?, color=?, position=? WHERE id=?')
    .run(label ?? col.label, color ?? col.color, position ?? col.position, req.params.id);
  const updated = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/columns/:id', (req, res) => {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('UPDATE cards SET column_name = ? WHERE column_name = ? AND board_id = ?').run('backlog', col.name, col.board_id);
  db.prepare('DELETE FROM columns WHERE id = ?').run(req.params.id);
  res.json({ ok: true, movedCardsTo: 'backlog' });
});

// === Karten-API ===

router.get('/cards', (req, res) => {
  const { board_id } = req.query;
  let cards;
  if (board_id) {
    cards = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, id ASC').all(board_id);
  } else {
    cards = db.prepare('SELECT * FROM cards ORDER BY position ASC, id ASC').all();
  }
  res.json(cards.map(c => ({ ...c, labels: JSON.parse(c.labels || '[]') })));
});

router.get('/tasks', (req, res) => {
  const { board_id } = req.query;
  let cards;
  if (board_id) {
    cards = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY position ASC, id ASC').all(board_id);
  } else {
    cards = db.prepare('SELECT * FROM cards ORDER BY position ASC, id ASC').all();
  }
  res.json(cards.map(c => ({ ...c, labels: JSON.parse(c.labels || '[]') })));
});

router.put('/cards/reorder', (req, res) => {
  const { cards } = req.body;
  const stmt = db.prepare("UPDATE cards SET column_name=?, position=?, updated_at=datetime('now') WHERE id=?");
  const tx = db.transaction((items) => {
    for (const c of items) stmt.run(c.column_name, c.position, c.id);
  });
  tx(cards || []);
  res.json({ ok: true });
});

router.post('/tasks', (req, res) => {
  const { title, description = '', status = 'backlog', labels = [], board_id, due_date, on_hold = 0 } = req.body;
  if (!title) return res.status(400).json({ error: 'Titel erforderlich' });
  const maxPos = board_id 
    ? db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ? AND board_id = ?').get(status, board_id)
    : db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ?').get(status);
  const result = db.prepare(
    'INSERT INTO cards (title, description, column_name, labels, position, board_id, due_date, on_hold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(title, description, status, JSON.stringify(labels), (maxPos?.m || 0) + 1, board_id || null, due_date || null, on_hold || 0);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...card, labels: JSON.parse(card.labels), status: card.column_name });
});

router.post('/cards', (req, res) => {
  const { title, description = '', column_name = 'backlog', labels = [], board_id, due_date, on_hold = 0 } = req.body;
  if (!title) return res.status(400).json({ error: 'Titel erforderlich' });
  const maxPos = board_id 
    ? db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ? AND board_id = ?').get(column_name, board_id)
    : db.prepare('SELECT COALESCE(MAX(position),0) as m FROM cards WHERE column_name = ?').get(column_name);
  const result = db.prepare(
    'INSERT INTO cards (title, description, column_name, labels, position, board_id, due_date, on_hold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(title, description, column_name, JSON.stringify(labels), (maxPos?.m || 0) + 1, board_id || null, due_date || null, on_hold || 0);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...card, labels: JSON.parse(card.labels) });
});

router.put('/cards/:id', (req, res) => {
  const { title, description, column_name, labels, position, due_date, on_hold, result } = req.body;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Nicht gefunden' });

  db.prepare(`UPDATE cards SET title=?, description=?, column_name=?, labels=?, position=?, due_date=?, on_hold=?, result=?, updated_at=datetime('now') WHERE id=?`)
    .run(
      title ?? card.title,
      description ?? card.description,
      column_name ?? card.column_name,
      JSON.stringify(labels ?? JSON.parse(card.labels)),
      position ?? card.position,
      due_date ?? card.due_date,
      on_hold ?? card.on_hold,
      result ?? card.result,
      req.params.id
    );
  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  res.json({ ...updated, labels: JSON.parse(updated.labels) });
});

router.delete('/cards/:id', (req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Execute task via OpenClaw
router.post('/tasks/:id/execute', async (req, res) => {
  const task = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  // Don't execute if task is on hold
  if (task.on_hold) {
    return res.status(400).json({ error: 'Task ist auf "On Hold" gesetzt' });
  }

  if (!OPENCLAW_TOKEN) {
    return res.status(500).json({ error: 'OpenClaw Token nicht konfiguriert' });
  }

  try {
    const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json',
        'x-openclaw-agent-id': 'main'
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: [{
          role: 'user',
          content: `Bearbeite diesen Task:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nFühre die beschriebene Aufgabe aus.`
        }],
        user: `schildi-dashboard-task-${task.id}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `OpenClaw Fehler: ${response.status} - ${errorText}` });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten';

    // Save result and move task to done
    db.prepare(`UPDATE cards SET result=?, column_name='done', updated_at=datetime('now') WHERE id=?`)
      .run(result, req.params.id);

    res.json({ 
      success: true, 
      result, 
      movedTo: 'done'
    });

  } catch (error) {
    console.error('Execute task error:', error);
    res.status(500).json({ error: `Verbindungsfehler: ${error.message}` });
  }
});

module.exports = router;
