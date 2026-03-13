const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate } = require('../auth');

const CONTENT_DIR = process.env.CONTENT_DIR || process.env.MEDIA_DIR || '/content';

router.use(authenticate);

// Sicherheit: Pfad darf nicht aus CONTENT_DIR ausbrechen
function safePath(userPath) {
  const resolved = path.resolve(CONTENT_DIR, userPath || '');
  if (!resolved.startsWith(path.resolve(CONTENT_DIR))) {
    throw new Error('Pfad nicht erlaubt');
  }
  return resolved;
}

// Verzeichnis auflisten
router.get('/browse', (req, res) => {
  try {
    const dirPath = safePath(req.query.path || '');
    if (!fs.existsSync(dirPath)) return res.json({ entries: [], path: req.query.path || '' });

    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(CONTENT_DIR, fullPath);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: relPath,
        isDirectory: entry.isDirectory(),
        size: entry.isDirectory() ? null : stat.size,
        modified: stat.mtime.toISOString(),
      };
    });

    // Ordner zuerst, dann alphabetisch
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ entries, path: req.query.path || '' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Datei lesen/ausliefern
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

// Textdatei-Inhalt lesen
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

// Ordner erstellen
router.post('/mkdir', express.json(), (req, res) => {
  try {
    const dirPath = safePath(req.body.path);
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true, path: req.body.path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Datei/Ordner löschen
router.delete('/delete', (req, res) => {
  try {
    const targetPath = safePath(req.query.path);
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Nicht gefunden' });
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Upload
const upload = multer({ dest: '/tmp/content-uploads' });
router.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    const targetDir = safePath(req.body.path || '');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const uploaded = [];
    for (const file of (req.files || [])) {
      const dest = path.join(targetDir, file.originalname);
      fs.copyFileSync(file.path, dest);
      fs.unlinkSync(file.path);
      uploaded.push({
        name: file.originalname,
        path: path.relative(CONTENT_DIR, dest),
        size: file.size,
      });
    }
    res.json({ ok: true, files: uploaded });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
