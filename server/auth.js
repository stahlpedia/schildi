const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

// Generate a random JWT secret if none is set (persists per container lifecycle)
const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function ensureDefaultUser() {
  const username = process.env.DASHBOARD_USER || 'admin';
  const password = process.env.DASHBOARD_PASSWORD || 'changeme';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  } else {
    // Update password on every start so ENV changes take effect
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
  }
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  const bearerToken = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
  const token = bearerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig' });
  }
}

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { ensureDefaultUser, authenticate, login };
