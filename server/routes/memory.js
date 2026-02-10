const { Router } = require('express');
const { authenticate } = require('../auth');
const fs = require('fs');
const path = require('path');

const router = Router();
router.use(authenticate);

const WORKSPACE = process.env.WORKSPACE_PATH || '/home/node/.openclaw/workspace';
const TOP_FILES = ['MEMORY.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md'];

router.get('/files', (req, res) => {
  const files = [];
  // Top-level files
  for (const f of TOP_FILES) {
    const fp = path.join(WORKSPACE, f);
    if (fs.existsSync(fp)) files.push({ name: f, path: f });
  }
  // memory/*.md
  const memDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memDir)) {
    const entries = fs.readdirSync(memDir).filter(f => f.endsWith('.md')).sort().reverse();
    for (const f of entries) files.push({ name: `memory/${f}`, path: `memory/${f}` });
  }
  res.json(files);
});

router.get('/file', (req, res) => {
  const rel = req.query.path;
  if (!rel || rel.includes('..')) return res.status(400).json({ error: 'Ungültiger Pfad' });
  const fp = path.join(WORKSPACE, rel);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ content: fs.readFileSync(fp, 'utf-8') });
});

module.exports = router;
