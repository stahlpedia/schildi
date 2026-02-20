const { Router } = require('express');
const { authenticate } = require('../auth');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = Router({ mergeParams: true });
router.use(authenticate);

const WEBSITES_DIR = process.env.WEBSITES_DIR || '/var/www/ai-websites';
const CADDY_API = process.env.CADDY_API || 'http://caddy:2019';

fs.mkdirSync(WEBSITES_DIR, { recursive: true });

// --- Validation helpers ---
function isValidDomain(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/.test(name) && !name.includes('..');
}
function safePath(domain, filePath) {
  const base = path.resolve(WEBSITES_DIR, domain);
  const full = path.resolve(base, filePath);
  if (!full.startsWith(base + path.sep) && full !== base) return null;
  return full;
}
function getMimeType(ext) {
  const map = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'text/xml', '.txt': 'text/plain', '.md': 'text/markdown' };
  return map[ext] || 'text/plain';
}

// --- Caddy helpers ---
async function registerCaddyRoute(domain) {
  try {
    await fetch(`${CADDY_API}/config/apps/http/servers/srv0/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "@id": `site_${domain}`, "match": [{ "host": [domain] }], "handle": [{ "handler": "vars", "root": `/srv/websites/${domain}` }, { "handler": "file_server" }] })
    });
  } catch (e) { console.error(`[Caddy] Failed to register ${domain}:`, e.message); }
}
async function removeCaddyRoute(domain) {
  try { await fetch(`${CADDY_API}/id/site_${domain}`, { method: 'DELETE' }); } catch (e) { console.error(`[Caddy] Failed to remove ${domain}:`, e.message); }
}
async function registerAllCaddyRoutes() {
  try {
    const entries = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true });
    for (const entry of entries) { if (entry.isDirectory()) await registerCaddyRoute(entry.name); }
  } catch (e) { console.error('[Caddy] Failed to register routes on startup:', e.message); }
}
registerAllCaddyRoutes();

function buildFileTree(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relPath = path.relative(base, path.join(dir, entry.name));
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: relPath, type: 'directory', children: buildFileTree(path.join(dir, entry.name), base) });
    } else {
      result.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }
  return result.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
}

// ============================================================
// Project-scoped Pages Domains
// ============================================================

// GET /api/projects/:projectId/pages/domains
router.get('/domains', (req, res) => {
  const projectId = req.params.projectId;
  if (projectId) {
    // Project-scoped
    const domains = db.prepare('SELECT * FROM pages_domains WHERE project_id = ? ORDER BY domain ASC').all(projectId);
    return res.json(domains);
  }
  // Legacy: filesystem-based listing
  try {
    const entries = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true });
    const domains = entries.filter(e => e.isDirectory()).map(e => ({ name: e.name })).sort((a, b) => a.name.localeCompare(b.name));
    res.json(domains);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/domains', async (req, res) => {
  const projectId = req.params.projectId;
  const { name, domain } = req.body;
  const domainName = domain || name;
  if (!domainName || !isValidDomain(domainName)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });

  const domainDir = path.join(WEBSITES_DIR, domainName);
  if (fs.existsSync(domainDir) && !projectId) return res.status(409).json({ error: 'Domain existiert bereits' });

  try {
    fs.mkdirSync(domainDir, { recursive: true });
    await registerCaddyRoute(domainName);

    if (projectId) {
      // Also create DB record
      const existing = db.prepare('SELECT id FROM pages_domains WHERE domain = ?').get(domainName);
      if (existing) return res.status(409).json({ error: 'Domain existiert bereits' });
      const result = db.prepare('INSERT INTO pages_domains (project_id, domain) VALUES (?, ?)').run(projectId, domainName);
      return res.status(201).json(db.prepare('SELECT * FROM pages_domains WHERE id = ?').get(result.lastInsertRowid));
    }
    res.status(201).json({ name: domainName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/domains/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidDomain(name)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const domainDir = path.join(WEBSITES_DIR, name);
  if (!fs.existsSync(domainDir)) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    fs.rmSync(domainDir, { recursive: true, force: true });
    await removeCaddyRoute(name);
    // Also remove from DB
    const domainRec = db.prepare('SELECT id FROM pages_domains WHERE domain = ?').get(name);
    if (domainRec) {
      db.prepare('DELETE FROM page_media WHERE page_id IN (SELECT id FROM pages WHERE domain_id = ?)').run(domainRec.id);
      db.prepare('DELETE FROM pages WHERE domain_id = ?').run(domainRec.id);
      db.prepare('DELETE FROM pages_domains WHERE id = ?').run(domainRec.id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Page Media
// ============================================================

// GET /api/projects/:projectId/pages/domains/:domainId/media — list media for a domain
router.get('/domains-by-id/:domainId/media', (req, res) => {
  const domainRec = db.prepare('SELECT id FROM pages_domains WHERE id = ?').get(req.params.domainId);
  if (!domainRec) return res.status(404).json({ error: 'Domain nicht gefunden' });
  const media = db.prepare(`
    SELECT pm.*, mf.filename, mf.filepath, mf.mimetype, mf.size
    FROM page_media pm
    JOIN media_files mf ON pm.media_file_id = mf.id
    JOIN pages p ON pm.page_id = p.id
    WHERE p.domain_id = ?
    ORDER BY pm.position ASC
  `).all(req.params.domainId);
  res.json(media);
});

// GET /api/projects/:projectId/pages/:pageId/media
router.get('/:pageId/media', (req, res) => {
  const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' });
  const media = db.prepare(`
    SELECT pm.*, mf.filename, mf.filepath, mf.mimetype, mf.size
    FROM page_media pm
    JOIN media_files mf ON pm.media_file_id = mf.id
    WHERE pm.page_id = ?
    ORDER BY pm.position ASC
  `).all(req.params.pageId);
  res.json(media);
});

// POST /api/projects/:projectId/pages/:pageId/media
router.post('/:pageId/media', (req, res) => {
  const { media_file_id, position = 0 } = req.body;
  if (!media_file_id) return res.status(400).json({ error: 'media_file_id erforderlich' });
  const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' });
  const result = db.prepare('INSERT INTO page_media (page_id, media_file_id, position) VALUES (?, ?, ?)')
    .run(req.params.pageId, media_file_id, position);
  res.status(201).json(db.prepare('SELECT * FROM page_media WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/:pageId/media/:id', (req, res) => {
  db.prepare('DELETE FROM page_media WHERE id = ? AND page_id = ?').run(req.params.id, req.params.pageId);
  res.json({ ok: true });
});

// ============================================================
// Legacy file endpoints (backward compat for Caddy/serving)
// ============================================================

router.get('/domains/:name/files', (req, res) => {
  const { name } = req.params;
  if (!isValidDomain(name)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const domainDir = path.join(WEBSITES_DIR, name);
  if (!fs.existsSync(domainDir)) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try { res.json(buildFileTree(domainDir, domainDir)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/domains/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return res.status(404).json({ error: 'Datei nicht gefunden' });
  try {
    const content = fs.readFileSync(full, 'utf-8');
    res.json({ name: path.basename(full), path: filePath, content, type: getMimeType(path.extname(full)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/domains/:name/files', (req, res) => {
  const { name } = req.params;
  const { path: filePath, content } = req.body;
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content || '', 'utf-8');
    res.status(201).json({ name: path.basename(full), path: filePath });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/domains/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  const { content } = req.body;
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  try { fs.writeFileSync(full, content ?? '', 'utf-8'); res.json({ name: path.basename(full), path: filePath }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/domains/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  try { fs.rmSync(full, { recursive: true, force: true }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
