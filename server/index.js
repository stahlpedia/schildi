require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureDefaultUser, login, authenticate } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// Auth
ensureDefaultUser();

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const token = login(username, password);
  if (!token) return res.status(401).json({ error: 'Falsche Zugangsdaten' });
  res.json({ token, username });
});

// Media file serving WITHOUT auth (for img src — MUST be before authenticated routers)
const db = require('./db');
const fs = require('fs');

app.get('/api/media/file/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..'), file.filepath);
  if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: 'Physische Datei nicht gefunden' });
  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Length', file.size);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  fs.createReadStream(resolvedPath).pipe(res);
});

app.get('/api/media/files/:id/serve', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..'), file.filepath);
  if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: 'Physische Datei nicht gefunden' });
  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Length', file.size);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  fs.createReadStream(resolvedPath).pipe(res);
});

// Text file content (read/write for .md, .txt, .json, .yml, .yaml, .css, .html, .js etc.)
const TEXT_EXTENSIONS = new Set(['md', 'txt', 'json', 'yml', 'yaml', 'css', 'html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'xml', 'csv', 'svg', 'toml', 'ini', 'cfg', 'sh', 'bash', 'py', 'rb', 'php', 'sql', 'env', 'log']);
const isTextFile = (filename) => { const ext = (filename || '').split('.').pop().toLowerCase(); return TEXT_EXTENSIONS.has(ext); };

app.get('/api/media/files/:id/content', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  if (!isTextFile(file.filename)) return res.status(400).json({ error: 'Keine Textdatei' });
  const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..'), file.filepath);
  if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: 'Physische Datei nicht gefunden' });
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  res.json({ content, filename: file.filename });
});

app.put('/api/media/files/:id/content', authenticate, (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  if (!isTextFile(file.filename)) return res.status(400).json({ error: 'Keine Textdatei' });
  const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..'), file.filepath);
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) required' });
  fs.writeFileSync(resolvedPath, content, 'utf-8');
  const newSize = Buffer.byteLength(content, 'utf-8');
  db.prepare('UPDATE media_files SET size = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newSize, file.id);
  res.json({ ok: true, size: newSize });
});

// Dynamic manifest.json (uses branding logo if available)
app.get('/manifest.json', (req, res) => {
  const titleRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_title');
  const logoRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_logo_path');
  const title = titleRow?.value || 'Schildi Dashboard';
  const hasLogo = logoRow?.value && fs.existsSync(logoRow.value);
  
  const icons = hasLogo
    ? [
        { src: '/api/admin/branding/logo-file', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/api/admin/branding/logo-file', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ]
    : [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      ];

  res.json({
    name: title,
    short_name: title.length > 12 ? title.split(' ')[0] : title,
    description: 'Dashboard für KI-Agenten und Projektmanagement',
    theme_color: '#10b981',
    background_color: '#030712',
    display: 'standalone',
    orientation: 'portrait-primary',
    start_url: '/',
    scope: '/',
    icons,
  });
});

// SSE (Server-Sent Events) for real-time updates
const { sseHandler } = require('./lib/events');
app.get('/api/events', authenticate, sseHandler);

// API Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/kanban', require('./routes/kanban'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/log', require('./routes/log'));
app.use('/api/channel', require('./routes/channel'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/skills', require('./routes/skills'));
app.use('/api/push', require('./routes/push').router);

// Project-scoped route mounts
// Kanban: /api/projects/:projectId/boards, /api/projects/:projectId/calendar
app.use('/api', require('./routes/kanban'));

// Social: /api/projects/:projectId/social/*
const socialRouter = require('./routes/social');
app.use('/api/projects/:projectId/social', socialRouter);
app.use('/api/social', socialRouter);

// Context (Media): /api/projects/:projectId/context/*
const mediaRouter = require('./routes/media');
app.use('/api/projects/:projectId/context', mediaRouter);
app.use('/api/media', mediaRouter);

// Content Profiles: /api/projects/:projectId/content-profiles
app.use('/api/projects/:projectId/content-profiles', require('./routes/content-profiles'));

// Context Textfiles: /api/projects/:projectId/context/folders/:folderId/textfiles
app.use('/api/projects/:projectId/context/folders/:folderId/textfiles', require('./routes/context-textfiles'));
// Also mount for direct textfile access by id
app.use('/api/projects/:projectId/context/textfiles', require('./routes/context-textfiles'));

// Pages: /api/projects/:projectId/pages/*
const pagesRouter = require('./routes/pages');
app.use('/api/projects/:projectId/pages', pagesRouter);

// Serve frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Catch-all for frontend routing (MUST be last!)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐢 Schildi Dashboard läuft auf Port ${PORT}`);

  // Sync OpenClaw skill after startup (delayed to not block boot)
  setTimeout(() => {
    const { syncSkill } = require('./lib/skill-sync');
    syncSkill().catch(err => console.error('[skill-sync] Error:', err.message));
  }, 5000);
});

// Graceful shutdown: close Puppeteer browser
process.on('SIGTERM', async () => {
  const { closeBrowser } = require('./lib/renderer');
  await closeBrowser();
  process.exit(0);
});
process.on('SIGINT', async () => {
  const { closeBrowser } = require('./lib/renderer');
  await closeBrowser();
  process.exit(0);
});
