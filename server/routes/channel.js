const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const OPENWEBUI_URL = process.env.OPENWEBUI_URL || 'http://open-webui:8080';
const OPENWEBUI_API_KEY = process.env.OPENWEBUI_API_KEY || '';

const router = Router();
router.use(authenticate);

// List all conversations
router.get('/conversations', (req, res) => {
  const convos = db.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
  res.json(convos);
});

// Create conversation
router.post('/conversations', (req, res) => {
  const { title, author = 'user', type = 'agent', model_id = '' } = req.body;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const fullTitle = title ? `${now} — ${title}` : now;
  const result = db.prepare('INSERT INTO conversations (title, has_unanswered, type, model_id) VALUES (?, ?, ?, ?)').run(fullTitle, 1, type, model_id);
  const convo = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(convo);
});

// Get messages for a conversation (marks as read)
router.get('/conversations/:id/messages', (req, res) => {
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
  // Mark as read when human opens the conversation
  db.prepare('UPDATE conversations SET has_unanswered = 0 WHERE id = ?').run(req.params.id);
  res.json(msgs);
});

// Post message to conversation
router.post('/conversations/:id/messages', async (req, res) => {
  const { author, text, task_ref } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'author und text erforderlich' });
  if (!['user', 'agent'].includes(author)) return res.status(400).json({ error: 'author muss user oder agent sein' });

  const convo = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation nicht gefunden' });

  const result = db.prepare('INSERT INTO messages (conversation_id, author, text, task_ref) VALUES (?, ?, ?, ?)').run(req.params.id, author, text, task_ref || null);

  // Agent writes → human needs to see it (has_unanswered=1)
  // Human writes → agent needs to see it (agent_unread=1)
  if (author === 'agent') {
    db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
  } else if (author === 'user') {
    db.prepare('UPDATE conversations SET agent_unread = 1 WHERE id = ?').run(req.params.id);
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

  // If this is a model-type conversation and the user sent the message, call OpenWebUI
  if (convo.type === 'model' && author === 'user' && convo.model_id) {
    try {
      // Build conversation history
      const history = db.prepare('SELECT author, text FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
      const chatMessages = history.map(m => ({
        role: m.author === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const response = await fetch(`${OPENWEBUI_URL}/api/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENWEBUI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: convo.model_id,
          messages: chatMessages
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        // Save error as agent message
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Fehler von OpenWebUI: ${response.status} — ${errText}`);
        db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
      } else {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || '(Keine Antwort)';
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', reply);
        db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
      }
    } catch (e) {
      db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Verbindungsfehler: ${e.message}`);
      db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
    }
  }

  res.status(201).json(msg);
});

// Get unanswered conversations
router.get('/unanswered', (req, res) => {
  const convos = db.prepare('SELECT c.*, (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message FROM conversations c WHERE c.has_unanswered = 1 ORDER BY c.created_at DESC').all();
  res.json(convos);
});

// Get conversations with unread human messages (for agent)
router.get('/agent-unread', (req, res) => {
  const convos = db.prepare(`
    SELECT c.*, (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c WHERE c.agent_unread = 1 ORDER BY c.created_at DESC
  `).all();
  res.json(convos);
});

// Mark conversation as read by agent
router.post('/conversations/:id/agent-read', (req, res) => {
  db.prepare('UPDATE conversations SET agent_unread = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Edit message
router.put('/messages/:id', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Nicht gefunden' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text erforderlich' });
  db.prepare("UPDATE messages SET text = ? WHERE id = ?").run(text, req.params.id);
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete message
router.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// List available models from OpenWebUI
router.get('/models', async (req, res) => {
  if (!OPENWEBUI_API_KEY) return res.json([]);
  try {
    const response = await fetch(`${OPENWEBUI_URL}/api/models`, {
      headers: { 'Authorization': `Bearer ${OPENWEBUI_API_KEY}` }
    });
    if (!response.ok) return res.json([]);
    const data = await response.json();
    // OpenWebUI returns { data: [...] } in OpenAI format
    const models = (data.data || data || []).map(m => ({ id: m.id, name: m.name || m.id }));
    res.json(models);
  } catch {
    res.json([]);
  }
});

module.exports = router;
