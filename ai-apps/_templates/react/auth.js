import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from './db.js';

const SESSION_COOKIE = 'session_token';
const SESSION_TTL_DAYS = Number.parseInt(process.env.SESSION_TTL_DAYS || '7', 10);

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const pairs = header.split(';');
  const out = {};
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const key = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

function sessionExpiresAt() {
  const ms = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (req?.secure) return true;

  const forwardedProto = req?.headers?.['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim() === 'https';
  }

  return false;
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/'
  };
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(trimmed) && trimmed.length <= 254;
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

export async function register(req, res) {
  const { email, password } = req.body || {};

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (exists) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(normalizedEmail, passwordHash);

  const user = { id: result.lastInsertRowid, email: normalizedEmail };
  await createSession(req, res, user.id);

  return res.status(201).json({ user });
}

export async function login(req, res) {
  const { email, password } = req.body || {};

  if (!validateEmail(email) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  cleanupExpiredSessions();

  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(normalizedEmail);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await createSession(req, res, user.id);
  return res.json({ user: { id: user.id, email: user.email } });
}

export function logout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
  return res.status(204).send();
}

export function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  cleanupExpiredSessions();

  const session = db
    .prepare(
      `SELECT s.user_id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .get(hashToken(token));

  if (!session) {
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = { id: session.user_id, email: session.email };
  return next();
}

export function me(req, res) {
  return res.json({ user: req.user });
}

async function createSession(req, res, userId) {
  cleanupExpiredSessions();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = sessionExpiresAt();

  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt
  );

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(req),
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  });
}
