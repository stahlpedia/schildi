const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = Router();
router.use(authenticate);

// --- Domain CRUD ---

router.get('/domains', (req, res) => {
  const domains = db.prepare('SELECT * FROM domains ORDER BY name ASC').all();
  res.json(domains);
});

router.post('/domains', (req, res) => {
  const { name, host, port, api_key, public_url } = req.body;
  if (!name || !host || !port) return res.status(400).json({ error: 'name, host, port erforderlich' });
  const result = db.prepare('INSERT INTO domains (name, host, port, api_key, public_url) VALUES (?, ?, ?, ?, ?)').run(name, host, port || 3000, api_key || '', public_url || '');
  const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(domain);
});

router.put('/domains/:id', (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  const { name, host, port, api_key, public_url } = req.body;
  db.prepare("UPDATE domains SET name = ?, host = ?, port = ?, api_key = ?, public_url = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name ?? domain.name, host ?? domain.host, port ?? domain.port, api_key ?? domain.api_key, public_url ?? domain.public_url ?? '', req.params.id);
  const updated = db.prepare('SELECT * FROM domains WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/domains/:id', (req, res) => {
  db.prepare('DELETE FROM domains WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Proxy to Pages containers ---

function getDomain(id) {
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id);
}

function proxyHeaders(domain) {
  const h = { 'Content-Type': 'application/json' };
  if (domain.api_key) h['X-Api-Key'] = domain.api_key;
  return h;
}

// List pages
router.get('/domains/:id/pages', async (req, res) => {
  const domain = getDomain(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    const r = await fetch(`http://${domain.host}:${domain.port}/api/pages`, { headers: proxyHeaders(domain) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Container nicht erreichbar', details: e.message });
  }
});

// Create page
router.post('/domains/:id/pages', async (req, res) => {
  const domain = getDomain(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    const r = await fetch(`http://${domain.host}:${domain.port}/api/pages`, {
      method: 'POST', headers: proxyHeaders(domain), body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Container nicht erreichbar', details: e.message });
  }
});

// Get single page
router.get('/domains/:id/pages/:slug', async (req, res) => {
  const domain = getDomain(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    const r = await fetch(`http://${domain.host}:${domain.port}/api/pages/${req.params.slug}`, { headers: proxyHeaders(domain) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Container nicht erreichbar', details: e.message });
  }
});

// Update page
router.put('/domains/:id/pages/:slug', async (req, res) => {
  const domain = getDomain(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    const r = await fetch(`http://${domain.host}:${domain.port}/api/pages/${req.params.slug}`, {
      method: 'PUT', headers: proxyHeaders(domain), body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Container nicht erreichbar', details: e.message });
  }
});

// Delete page
router.delete('/domains/:id/pages/:slug', async (req, res) => {
  const domain = getDomain(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    const r = await fetch(`http://${domain.host}:${domain.port}/api/pages/${req.params.slug}`, {
      method: 'DELETE', headers: proxyHeaders(domain)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Container nicht erreichbar', details: e.message });
  }
});

module.exports = router;
