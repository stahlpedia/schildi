import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import { login, logout, me, register, requireAuth } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number.parseInt(process.env.PORT || '3000', 10);

app.set('trust proxy', true);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'react-template' });
});

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, me);

app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ ok: true, message: `Hello ${req.user.email}` });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`React template app listening on ${port}`);
});
