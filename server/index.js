require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureDefaultUser, login } = require('./auth');

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

// API Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/kanban', require('./routes/kanban'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/log', require('./routes/log'));
app.use('/api/channel', require('./routes/channel'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/admin', require('./routes/admin'));

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

// Pages: /api/projects/:projectId/pages/*
const pagesRouter = require('./routes/pages');
app.use('/api/projects/:projectId/pages', pagesRouter);

// Media file serving without auth (for img src)
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

// Backward compat: /api/media/files/:id/serve
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

// Serve frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Catch-all for frontend routing (MUST be last!)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐢 Schildi Dashboard läuft auf Port ${PORT}`);
});
