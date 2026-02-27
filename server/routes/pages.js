const { Router } = require('express');
const { authenticate } = require('../auth');
const db = require('../db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const router = Router({ mergeParams: true });
router.use(authenticate);

const http = require('http');
const WEBSITES_DIR = process.env.WEBSITES_DIR || '/var/www/ai-websites';
const CADDY_API = process.env.CADDY_API || 'http://caddy:2019';
const ACME_EMAIL = process.env.ACME_EMAIL || 'admin@example.com';

// Use http.request instead of fetch for Caddy API calls.
// Node's fetch (undici) sends an empty Origin header which Caddy rejects.
function caddyRequest(method, urlPath, body) {
  const url = new URL(urlPath, CADDY_API);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: () => Promise.resolve(d), json: () => Promise.resolve(d ? JSON.parse(d) : null) });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

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
function buildCaddyRoute(domain, authRules = []) {
  const subroutes = [];

  // Auth rules first (before file_server)
  for (const rule of authRules) {
    const matchPath = rule.path === '/' ? ['/*'] : [rule.path.endsWith('/') ? `${rule.path}*` : rule.path];
    subroutes.push({
      match: [{ path: matchPath }],
      handle: [{
        handler: 'authentication',
        providers: {
          http_basic: {
            accounts: [{ username: rule.username, password: rule.password_hash }]
          }
        }
      }]
    });
  }

  // File server (always last)
  subroutes.push({
    handle: [
      { handler: 'vars', root: `/srv/websites/${domain}` },
      { handler: 'file_server', hide: ['/etc/caddy/Caddyfile'] }
    ]
  });

  return {
    '@id': `site_${domain}`,
    match: [{ host: [domain] }],
    handle: [{ handler: 'subroute', routes: subroutes }],
    terminal: true
  };
}

async function registerCaddyRoute(domain) {
  const authRules = db.prepare('SELECT path, username, password_hash FROM page_passwords WHERE domain = ?').all(domain);
  const route = buildCaddyRoute(domain, authRules);
  try {
    // Delete all existing routes with this @id first (Caddy can have duplicates)
    for (let i = 0; i < 20; i++) {
      const res = await caddyRequest('DELETE', `/id/site_${domain}`);
      if (!res.ok) break;
    }
    // Create fresh
    await caddyRequest('POST', '/config/apps/http/servers/srv0/routes', route);
  } catch (e) { console.error(`[Caddy] Failed to register ${domain}:`, e.message); }
}

async function syncCaddyAuth(domain) {
  return registerCaddyRoute(domain);
}

async function removeCaddyRoute(domain) {
  try { await caddyRequest('DELETE', `/id/site_${domain}`); } catch (e) { console.error(`[Caddy] Failed to remove ${domain}:`, e.message); }
}

async function syncCaddyTls() {
  try {
    // Collect all domains: website domains + existing TLS subjects
    const websiteDomains = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    // Read current TLS subjects to preserve non-website domains
    let existingSubjects = [];
    try {
      const res = await caddyRequest('GET', '/config/apps/tls/automation/policies/0/subjects');
      if (res.ok) existingSubjects = await res.json();
    } catch (_) {}
    const allSubjects = [...new Set([...existingSubjects, ...websiteDomains])];
    if (allSubjects.length === 0) return;
    // Ensure TLS app exists with policy covering all domains
    await caddyRequest('POST', '/config/apps/tls', {
      automation: {
        policies: [{
          subjects: allSubjects,
          issuers: [
            { module: 'acme', email: ACME_EMAIL },
            { module: 'acme', ca: 'https://acme.zerossl.com/v2/DV90', email: ACME_EMAIL }
          ]
        }]
      }
    });
    console.log(`[Caddy] TLS policy synced for ${allSubjects.length} domains`);
  } catch (e) { console.error('[Caddy] Failed to sync TLS:', e.message); }
}

async function registerAllCaddyRoutes() {
  try {
    const entries = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true });
    for (const entry of entries) { if (entry.isDirectory()) await registerCaddyRoute(entry.name); }
    await syncCaddyTls();
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

  try {
    if (projectId) {
      // Project-scoped: check DB only
      const existing = db.prepare('SELECT id FROM pages_domains WHERE domain = ?').get(domainName);
      if (existing) return res.status(409).json({ error: 'Domain existiert bereits' });
    } else {
      // Legacy: check filesystem
      if (fs.existsSync(domainDir)) return res.status(409).json({ error: 'Domain existiert bereits' });
    }

    fs.mkdirSync(domainDir, { recursive: true });
    await registerCaddyRoute(domainName);
    await syncCaddyTls();

    if (projectId) {
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
    await syncCaddyTls();
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

// ============================================================
// Password Protection
// ============================================================

// GET passwords for a domain
router.get('/passwords/:domain', (req, res) => {
  const { domain } = req.params;
  if (!isValidDomain(domain)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const passwords = db.prepare('SELECT id, domain, path, username, created_at FROM page_passwords WHERE domain = ? ORDER BY path ASC').all(domain);
  res.json(passwords);
});

// POST set password for a path
router.post('/passwords/:domain', async (req, res) => {
  const { domain } = req.params;
  let { path: protectedPath, username, password } = req.body;
  if (!isValidDomain(domain)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  if (!password) return res.status(400).json({ error: 'Passwort erforderlich' });

  protectedPath = protectedPath || '/';
  username = username || 'user';

  // Normalize: ensure path starts with /
  if (!protectedPath.startsWith('/')) protectedPath = '/' + protectedPath;

  const hash = bcrypt.hashSync(password, 10);

  try {
    db.prepare('INSERT OR REPLACE INTO page_passwords (domain, path, username, password_hash) VALUES (?, ?, ?, ?)')
      .run(domain, protectedPath, username, hash);
    await syncCaddyAuth(domain);
    res.status(201).json({ domain, path: protectedPath, username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE remove password for a path
router.delete('/passwords/:domain/*', async (req, res) => {
  const { domain } = req.params;
  let protectedPath = '/' + (req.params[0] || '');
  if (!isValidDomain(domain)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });

  try {
    const result = db.prepare('DELETE FROM page_passwords WHERE domain = ? AND path = ?').run(domain, protectedPath);
    if (result.changes === 0) return res.status(404).json({ error: 'Kein Schutz für diesen Pfad gefunden' });
    await syncCaddyAuth(domain);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
