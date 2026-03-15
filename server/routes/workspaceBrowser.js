const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../auth');

const WORKSPACE_DIR = process.env.WORKSPACE_PATH || '/home/node/.openclaw';

router.use(authenticate);

function safePath(userPath) {
  const resolved = path.resolve(WORKSPACE_DIR, userPath || '');
  if (!resolved.startsWith(path.resolve(WORKSPACE_DIR))) {
    throw new Error('Pfad nicht erlaubt');
  }
  return resolved;
}

router.get('/browse', (req, res) => {
  try {
    const dirPath = safePath(req.query.path || '');
    if (!fs.existsSync(dirPath)) return res.json({ entries: [], path: req.query.path || '' });
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Pfad ist kein Verzeichnis' });

    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(WORKSPACE_DIR, fullPath);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: relPath,
        isDirectory: entry.isDirectory(),
        size: entry.isDirectory() ? null : stat.size,
        modified: stat.mtime.toISOString(),
      };
    });

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ entries, path: req.query.path || '' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/file', (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }
    res.sendFile(filePath);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/text', (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, path: req.query.path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
