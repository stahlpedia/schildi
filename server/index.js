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
app.use('/api/kanban', require('./routes/kanban'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/log', require('./routes/log'));
app.use('/api/channel', require('./routes/channel'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/admin', require('./routes/admin'));

// Media file serving without auth (before media routes)
const db = require('./db');
const fs = require('fs');
app.get('/api/media/files/:id/serve', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  
  if (!fs.existsSync(file.filepath)) {
    return res.status(404).json({ error: 'Physische Datei nicht gefunden' });
  }
  
  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Length', file.size);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  
  const fileStream = fs.createReadStream(file.filepath);
  fileStream.pipe(res);
});

// Media routes (with auth)
app.use('/api/media', require('./routes/media'));

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
