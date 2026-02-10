const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

// List all conversations
router.get('/conversations', (req, res) => {
  const convos = db.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
  res.json(convos);
});

// Create conversation
router.post('/conversations', (req, res) => {
  const { title, author = 'user' } = req.body;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const fullTitle = title ? `${now} — ${title}` : now;
  const result = db.prepare('INSERT INTO conversations (title, has_unanswered) VALUES (?, ?)').run(fullTitle, author === 'user' ? 1 : 0);
  const convo = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(convo);
});

// Get messages for a conversation
router.get('/conversations/:id/messages', (req, res) => {
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(msgs);
});

// Post message to conversation
router.post('/conversations/:id/messages', (req, res) => {
  const { author, text, task_ref } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'author und text erforderlich' });
  if (!['user', 'agent'].includes(author)) return res.status(400).json({ error: 'author muss user oder agent sein' });

  const result = db.prepare('INSERT INTO messages (conversation_id, author, text, task_ref) VALUES (?, ?, ?, ?)').run(req.params.id, author, text, task_ref || null);

  // Update has_unanswered
  if (author === 'user') {
    db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('UPDATE conversations SET has_unanswered = 0 WHERE id = ?').run(req.params.id);
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(msg);
});

// Get unanswered conversations
router.get('/unanswered', (req, res) => {
  const convos = db.prepare('SELECT c.*, (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message FROM conversations c WHERE c.has_unanswered = 1 ORDER BY c.created_at DESC').all();
  res.json(convos);
});

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
