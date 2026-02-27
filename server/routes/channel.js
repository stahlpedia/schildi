const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const OPENWEBUI_URL = process.env.OPENWEBUI_URL || 'http://open-webui:8080';
const OPENWEBUI_API_KEY = process.env.OPENWEBUI_API_KEY || '';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://openclaw:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

const router = Router();
router.use(authenticate);

// === Chat Channels (project-scoped where applicable) ===

router.get('/chat-channels', (req, res) => {
  const { project_id } = req.query;
  if (project_id) {
    return res.json(db.prepare('SELECT * FROM chat_channels WHERE project_id = ? ORDER BY is_default DESC, id ASC').all(project_id));
  }
  res.json(db.prepare('SELECT * FROM chat_channels ORDER BY is_default DESC, id ASC').all());
});

router.post('/chat-channels', (req, res) => {
  const { name, type = 'model', model_id = '', project_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const pid = project_id || db.DEFAULT_PROJECT_ID;
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = db.prepare('SELECT id FROM chat_channels WHERE slug = ? AND project_id = ?').get(slug, pid);
  if (existing) return res.status(409).json({ error: 'Channel existiert bereits' });
  const result = db.prepare('INSERT INTO chat_channels (project_id, name, slug, type, model_id) VALUES (?, ?, ?, ?, ?)').run(pid, name, slug, type, model_id);
  res.status(201).json(db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/chat-channels/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name, model_id } = req.body;
  const slug = name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : ch.slug;
  db.prepare('UPDATE chat_channels SET name=?, slug=?, model_id=? WHERE id=?').run(name ?? ch.name, slug, model_id ?? ch.model_id, req.params.id);
  res.json(db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(req.params.id));
});

router.delete('/chat-channels/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Nicht gefunden' });
  if (ch.is_default) return res.status(400).json({ error: 'Standard-Channel kann nicht gelöscht werden' });
  const defaultCh = db.prepare("SELECT id FROM chat_channels WHERE is_default = 1 AND project_id = ?").get(ch.project_id);
  if (defaultCh) {
    db.prepare('UPDATE conversations SET channel_id = ? WHERE channel_id = ?').run(defaultCh.id, req.params.id);
  }
  db.prepare('DELETE FROM chat_channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// === Conversations ===

router.get('/conversations', (req, res) => {
  const { channel_id } = req.query;
  if (channel_id) {
    return res.json(db.prepare('SELECT * FROM conversations WHERE channel_id = ? ORDER BY created_at DESC').all(channel_id));
  }
  res.json(db.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all());
});

router.post('/conversations', (req, res) => {
  const { title, channel_id } = req.body;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const fullTitle = title ? `${now} — ${title}` : now;
  const result = db.prepare('INSERT INTO conversations (title, has_unanswered, channel_id) VALUES (?, ?, ?)').run(fullTitle, 1, channel_id || null);
  res.status(201).json(db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/conversations/:id/messages', (req, res) => {
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
  db.prepare('UPDATE conversations SET has_unanswered = 0 WHERE id = ?').run(req.params.id);
  res.json(msgs);
});

router.post('/conversations/:id/messages', async (req, res) => {
  const { author, text, task_ref } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'author und text erforderlich' });
  if (!['user', 'agent'].includes(author)) return res.status(400).json({ error: 'author muss user oder agent sein' });

  const convo = db.prepare('SELECT c.*, ch.type as ch_type, ch.model_id as ch_model_id FROM conversations c LEFT JOIN chat_channels ch ON c.channel_id = ch.id WHERE c.id = ?').get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation nicht gefunden' });

  const result = db.prepare('INSERT INTO messages (conversation_id, author, text, task_ref) VALUES (?, ?, ?, ?)').run(req.params.id, author, text, task_ref || null);

  if (author === 'agent') {
    db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
  } else if (author === 'user') {
    db.prepare('UPDATE conversations SET agent_unread = 1 WHERE id = ?').run(req.params.id);
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

  // If agent channel + user message → call OpenClaw
  if (convo.ch_type === 'agent' && author === 'user' && OPENCLAW_TOKEN) {
    try {
      const history = db.prepare('SELECT author, text FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
      const chatMessages = history.map(m => ({ role: m.author === 'user' ? 'user' : 'assistant', content: m.text }));
      const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENCLAW_TOKEN}`, 'Content-Type': 'application/json', 'x-openclaw-agent-id': 'main' },
        body: JSON.stringify({ model: 'openclaw:main', messages: chatMessages, user: `schildi-dashboard-convo-${req.params.id}` })
      });
      if (!response.ok) {
        const errText = await response.text();
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Fehler: ${response.status} — ${errText}`);
      } else {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || '(Keine Antwort)';
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', reply);
      }
      db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
    } catch (e) {
      db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Verbindungsfehler: ${e.message}`);
      db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
    }
  }

  // If model channel + user message → call n8n webhook (or OpenWebUI fallback)
  if (convo.ch_type === 'model' && author === 'user' && convo.ch_model_id) {
    const N8N_CHAT_URL = process.env.N8N_CHAT_URL;
    const DASHBOARD_ID = process.env.DASHBOARD_ID || '';
    try {
      const history = db.prepare('SELECT author, text FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
      const chatMessages = history.map(m => ({ role: m.author === 'user' ? 'user' : 'assistant', content: m.text }));
      const chatUrl = N8N_CHAT_URL || `${OPENWEBUI_URL}/api/chat/completions`;
      const chatHeaders = N8N_CHAT_URL
        ? { 'Content-Type': 'application/json', 'X-Dashboard-Id': DASHBOARD_ID }
        : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENWEBUI_API_KEY}` };
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({ model: convo.ch_model_id, messages: chatMessages })
      });
      if (!response.ok) {
        const errText = await response.text();
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Fehler: ${response.status} — ${errText}`);
      } else {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || '(Keine Antwort)';
        db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', reply);
      }
      db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
    } catch (e) {
      db.prepare('INSERT INTO messages (conversation_id, author, text) VALUES (?, ?, ?)').run(req.params.id, 'agent', `⚠️ Verbindungsfehler: ${e.message}`);
      db.prepare('UPDATE conversations SET has_unanswered = 1 WHERE id = ?').run(req.params.id);
    }
  }

  res.status(201).json(msg);
});

// === Utility endpoints ===

router.get('/unanswered', (req, res) => {
  res.json(db.prepare('SELECT c.*, (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message FROM conversations c WHERE c.has_unanswered = 1 ORDER BY c.created_at DESC').all());
});

router.get('/agent-unread', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, ch.type as ch_type,
      (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c LEFT JOIN chat_channels ch ON c.channel_id = ch.id
    WHERE c.agent_unread = 1 AND (ch.type = 'agent' OR ch.type IS NULL)
    ORDER BY c.created_at DESC
  `).all());
});

router.post('/conversations/:id/agent-read', (req, res) => {
  db.prepare('UPDATE conversations SET agent_unread = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.put('/messages/:id', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Nicht gefunden' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text erforderlich' });
  db.prepare("UPDATE messages SET text = ? WHERE id = ?").run(text, req.params.id);
  res.json(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id));
});

router.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/models', async (req, res) => {
  const N8N_MODELS_URL = process.env.N8N_MODELS_URL;
  const DASHBOARD_ID = process.env.DASHBOARD_ID || '';
  let allModels = [];

  // OpenClaw (if configured)
  if (OPENCLAW_TOKEN) {
    try {
      const response = await fetch(`${OPENCLAW_URL}/v1/models`, {
        headers: { 'Authorization': `Bearer ${OPENCLAW_TOKEN}` }
      });
      if (response.ok) {
        const data = await response.json();
        const models = (data.data || data || []).map(m => ({ id: m.id, name: m.name || m.id, source: 'openclaw' }));
        allModels.push(...models);
      }
    } catch (e) {
      console.warn('OpenClaw models fetch failed:', e.message);
    }
  }

  // n8n webhook (if configured)
  if (N8N_MODELS_URL) {
    try {
      const response = await fetch(N8N_MODELS_URL, {
        headers: { 'Content-Type': 'application/json', 'X-Dashboard-Id': DASHBOARD_ID }
      });
      if (response.ok) {
        const data = await response.json();
        const models = (data.data || data || []).map(m => ({ id: m.id, name: m.name || m.id, source: 'n8n' }));
        allModels.push(...models);
      }
    } catch (e) {
      console.warn('n8n models fetch failed:', e.message);
    }
  }

  // OpenWebUI (if configured)
  if (OPENWEBUI_API_KEY) {
    try {
      const response = await fetch(`${OPENWEBUI_URL}/api/models`, { headers: { 'Authorization': `Bearer ${OPENWEBUI_API_KEY}` } });
      if (response.ok) {
        const data = await response.json();
        const models = (data.data || data || []).map(m => ({ id: m.id, name: m.name || m.id, source: 'openwebui' }));
        allModels.push(...models);
      }
    } catch (e) {
      console.warn('OpenWebUI models fetch failed:', e.message);
    }
  }

  res.json(allModels);
});

module.exports = router;
