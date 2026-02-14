const { Router } = require('express');
const { authenticate } = require('../auth');
const fs = require('fs');
const path = require('path');

const router = Router();
router.use(authenticate);

const WEBSITES_DIR = process.env.WEBSITES_DIR || '/var/www/ai-websites';
const CADDY_API = process.env.CADDY_API || 'http://caddy:2019';

// Ensure WEBSITES_DIR exists
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
      body: JSON.stringify({
        "@id": `site_${domain}`,
        "match": [{ "host": [domain] }],
        "handle": [
          { "handler": "vars", "root": `/srv/websites/${domain}` },
          { "handler": "file_server" }
        ]
      })
    });
    console.log(`[Caddy] Registered route for ${domain}`);
  } catch (e) {
    console.error(`[Caddy] Failed to register ${domain}:`, e.message);
  }
}

async function removeCaddyRoute(domain) {
  try {
    await fetch(`${CADDY_API}/id/site_${domain}`, { method: 'DELETE' });
    console.log(`[Caddy] Removed route for ${domain}`);
  } catch (e) {
    console.error(`[Caddy] Failed to remove ${domain}:`, e.message);
  }
}

async function registerAllCaddyRoutes() {
  try {
    const entries = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await registerCaddyRoute(entry.name);
      }
    }
  } catch (e) {
    console.error('[Caddy] Failed to register routes on startup:', e.message);
  }
}

// Register all routes on startup (non-blocking)
registerAllCaddyRoutes();

// --- File tree helper ---

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

// --- Domain endpoints ---

router.get('/domains', (req, res) => {
  try {
    const entries = fs.readdirSync(WEBSITES_DIR, { withFileTypes: true });
    const domains = entries.filter(e => e.isDirectory()).map(e => ({ name: e.name })).sort((a, b) => a.name.localeCompare(b.name));
    res.json(domains);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/domains', async (req, res) => {
  const { name } = req.body;
  if (!name || !isValidDomain(name)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const domainDir = path.join(WEBSITES_DIR, name);
  if (fs.existsSync(domainDir)) return res.status(409).json({ error: 'Domain existiert bereits' });
  try {
    fs.mkdirSync(domainDir, { recursive: true });
    await registerCaddyRoute(name);
    res.status(201).json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/domains/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidDomain(name)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const domainDir = path.join(WEBSITES_DIR, name);
  if (!fs.existsSync(domainDir)) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    fs.rmSync(domainDir, { recursive: true, force: true });
    await removeCaddyRoute(name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- File endpoints ---

router.get('/domains/:name/files', (req, res) => {
  const { name } = req.params;
  if (!isValidDomain(name)) return res.status(400).json({ error: 'Ungültiger Domain-Name' });
  const domainDir = path.join(WEBSITES_DIR, name);
  if (!fs.existsSync(domainDir)) return res.status(404).json({ error: 'Domain nicht gefunden' });
  try {
    res.json(buildFileTree(domainDir, domainDir));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    const ext = path.extname(full);
    res.json({ name: path.basename(full), path: filePath, content, type: getMimeType(ext) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/domains/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  const { content } = req.body;
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  try {
    fs.writeFileSync(full, content ?? '', 'utf-8');
    res.json({ name: path.basename(full), path: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/domains/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  if (!isValidDomain(name) || !filePath) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const full = safePath(name, filePath);
  if (!full) return res.status(400).json({ error: 'Ungültiger Pfad' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Datei nicht gefunden' });
  try {
    fs.rmSync(full, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
