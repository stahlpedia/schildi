const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

router.get('/entries', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const entries = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  res.json(entries);
});

router.post('/entries', (req, res) => {
  const { message, category = '' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message erforderlich' });
  const result = db.prepare('INSERT INTO logs (message, category) VALUES (?, ?)').run(message, category);
  const entry = db.prepare('SELECT * FROM logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

router.delete('/entries/:id', (req, res) => {
  db.prepare('DELETE FROM logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
