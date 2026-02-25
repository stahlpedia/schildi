const { Router } = require('express');
const { authenticate } = require('../auth');
const fs = require('fs');
const path = require('path');

const router = Router();
router.use(authenticate);

const WORKSPACE = process.env.WORKSPACE_PATH || '/home/node/.openclaw/workspace';
const SKILLS_DIR = path.join(WORKSPACE, 'skills');

// GET /api/skills - list all skills
router.get('/', (req, res) => {
  if (!fs.existsSync(SKILLS_DIR)) return res.json([]);
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const content = fs.readFileSync(skillMd, 'utf-8');
    // Parse frontmatter
    let name = entry.name, description = '';
    if (content.startsWith('---')) {
      const end = content.indexOf('---', 3);
      if (end > 0) {
        const fm = content.substring(3, end);
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        const descMatch = fm.match(/^description:\s*(.+)$/m);
        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
      }
    }
    skills.push({ id: entry.name, name, description });
  }
  res.json(skills);
});

// GET /api/skills/:id - get skill content
router.get('/:id', (req, res) => {
  const id = req.params.id;
  if (id.includes('..') || id.includes('/')) return res.status(400).json({ error: 'Ungültig' });
  const skillDir = path.join(SKILLS_DIR, id);
  if (!fs.existsSync(skillDir)) return res.status(404).json({ error: 'Nicht gefunden' });

  // Collect all files
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else {
        files.push(rel);
      }
    }
  };
  walk(skillDir, '');

  // Read SKILL.md
  const skillMd = path.join(skillDir, 'SKILL.md');
  const content = fs.existsSync(skillMd) ? fs.readFileSync(skillMd, 'utf-8') : '';

  res.json({ id, files, content });
});

// GET /api/skills/:id/file?path=... - get specific file
router.get('/:id/file', (req, res) => {
  const id = req.params.id;
  const rel = req.query.path;
  if (!rel || id.includes('..') || rel.includes('..')) return res.status(400).json({ error: 'Ungültig' });
  const fp = path.join(SKILLS_DIR, id, rel);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ content: fs.readFileSync(fp, 'utf-8') });
});

module.exports = router;
