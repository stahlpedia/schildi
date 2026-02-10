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

// Serve frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐢 Schildi Dashboard läuft auf Port ${PORT}`);
});
