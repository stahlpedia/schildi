const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = Router({ mergeParams: true });
router.use(authenticate);

const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, '..', 'data', 'media');
fs.mkdirSync(mediaDir, { recursive: true });

// Multer: store to temp first, rename after DB insert
const upload = multer({
  dest: path.join(mediaDir, 'tmp'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // All file types allowed
    cb(null, true);
  }
});

// ============================================================
// Context Folders (project-scoped, replaces media_folders)
// ============================================================
// Content Channels (project-scoped)
// ============================================================

router.get('/content-channels', (req, res) => {
  const projectId = req.params.projectId;
  const channels = db.prepare('SELECT * FROM content_channels WHERE project_id = ? ORDER BY position ASC, id ASC').all(projectId);
  res.json(channels);
});

router.post('/content-channels', (req, res) => {
  const projectId = req.params.projectId;
  const { name, position = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const result = db.prepare('INSERT INTO content_channels (project_id, name, position) VALUES (?, ?, ?)').run(projectId, name.trim(), position);
  res.status(201).json(db.prepare('SELECT * FROM content_channels WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/content-channels/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM content_channels WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name, position } = req.body;
  db.prepare('UPDATE content_channels SET name=?, position=? WHERE id=?').run(name?.trim() || ch.name, position ?? ch.position, ch.id);
  res.json(db.prepare('SELECT * FROM content_channels WHERE id = ?').get(ch.id));
});

router.delete('/content-channels/:id', (req, res) => {
  db.prepare('UPDATE context_folders SET channel_id = NULL WHERE channel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM content_channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// Context Folders (project-scoped, replaces media_folders)
// ============================================================

router.get('/folders', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { category, channel_id } = req.query;
  let sql = `SELECT f.*, (SELECT COUNT(*) FROM media_files WHERE folder_id = f.id) as file_count
    FROM context_folders f WHERE f.project_id = ?`;
  const params = [projectId];
  if (category) { sql += ' AND f.category = ?'; params.push(category); }
  if (channel_id) { sql += ' AND (f.channel_id = ? OR f.is_system = 1)'; params.push(channel_id); }
  sql += ' ORDER BY is_system DESC, position ASC, name ASC';
  const folders = db.prepare(sql).all(...params);
  res.json(folders);
});

router.post('/folders', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { name, type = 'custom', parent_id, category = 'content', channel_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const result = db.prepare('INSERT INTO context_folders (project_id, name, type, parent_id, category, channel_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(projectId, name.trim(), type, parent_id || null, category, channel_id || null);
  res.status(201).json(db.prepare('SELECT * FROM context_folders WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM context_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Ordner nicht gefunden' });
  if (folder.is_system) return res.status(400).json({ error: 'System-Ordner können nicht bearbeitet werden' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  db.prepare('UPDATE context_folders SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json(db.prepare('SELECT * FROM context_folders WHERE id = ?').get(req.params.id));
});

router.delete('/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM context_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Ordner nicht gefunden' });
  if (folder.is_system) return res.status(400).json({ error: 'System-Ordner können nicht gelöscht werden' });
  const fileCount = db.prepare('SELECT COUNT(*) as c FROM media_files WHERE folder_id = ?').get(req.params.id);
  if (fileCount.c > 0 && req.query.confirm !== 'true') {
    return res.status(400).json({ error: 'Ordner enthält Dateien. Mit ?confirm=true alle Dateien mit löschen.', fileCount: fileCount.c });
  }
  // Delete physical files
  const files = db.prepare('SELECT * FROM media_files WHERE folder_id = ?').all(req.params.id);
  for (const file of files) {
    const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..', '..'), file.filepath);
    try { fs.unlinkSync(resolvedPath); } catch (e) { console.warn('Could not delete:', resolvedPath, e.message); }
  }
  db.prepare('DELETE FROM media_files WHERE folder_id = ?').run(req.params.id);
  db.prepare('DELETE FROM context_folders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// Files (project-scoped)
// ============================================================

router.get('/files', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { folder_id, search, tag } = req.query;
  let query = 'SELECT * FROM media_files WHERE project_id = ?';
  const params = [projectId];
  if (folder_id) { query += ' AND folder_id = ?'; params.push(folder_id); }
  if (search) { query += ' AND filename LIKE ?'; params.push(`%${search}%`); }
  if (tag) { query += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// POST /api/projects/:projectId/context/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
  const projectId = req.params.projectId;
  if (!projectId) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'projectId required' }); }

  const { folderId, folder_id, tags = '[]' } = req.body;
  // Accept both camelCase and snake_case for consistency
  let parsedTags;
  try { parsedTags = JSON.parse(tags); } catch { parsedTags = []; }

  // Use first context folder if no folderId given
  let targetFolderId = folderId || folder_id;
  if (!targetFolderId) {
    const defaultFolder = db.prepare('SELECT id FROM context_folders WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId);
    targetFolderId = defaultFolder ? defaultFolder.id : null;
  }
  if (!targetFolderId) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Kein Ziel-Ordner vorhanden' }); }

  try {
    // Insert record first to get ID
    const result = db.prepare(`
      INSERT INTO media_files (project_id, folder_id, filename, filepath, mimetype, size, width, height, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, targetFolderId, req.file.originalname, '', req.file.mimetype, req.file.size, null, null, JSON.stringify(parsedTags));

    const fileId = result.lastInsertRowid;
    const storedName = `${fileId}_${req.file.originalname}`;
    const folderPath = path.join(mediaDir, String(targetFolderId));
    fs.mkdirSync(folderPath, { recursive: true });
    const finalPath = path.join(folderPath, storedName);

    // Move from tmp to final location
    fs.renameSync(req.file.path, finalPath);
    db.prepare('UPDATE media_files SET filepath = ? WHERE id = ?').run(finalPath, fileId);

    // Try to get dimensions async
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        sharp(finalPath).metadata().then(info => {
          db.prepare('UPDATE media_files SET width = ?, height = ? WHERE id = ?').run(info.width, info.height, fileId);
        }).catch(() => {});
      } catch {}
    }

    const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(fileId);
    res.status(201).json(file);
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: 'Fehler beim Speichern der Datei-Informationen' });
  }
});

router.put('/files/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const { tags, alt_text } = req.body;
  let parsedTags = file.tags;
  if (tags !== undefined) {
    try { parsedTags = JSON.stringify(Array.isArray(tags) ? tags : JSON.parse(tags)); }
    catch { return res.status(400).json({ error: 'Ungültiges Tags-Format' }); }
  }
  db.prepare("UPDATE media_files SET tags = ?, alt_text = ?, updated_at = datetime('now') WHERE id = ?")
    .run(parsedTags, alt_text !== undefined ? alt_text : file.alt_text, req.params.id);
  res.json(db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id));
});

router.delete('/files/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const resolvedPath = path.isAbsolute(file.filepath) ? file.filepath : path.resolve(path.join(__dirname, '..', '..'), file.filepath);
  try { fs.unlinkSync(resolvedPath); } catch (e) { console.warn('Could not delete:', resolvedPath, e.message); }
  db.prepare('DELETE FROM media_files WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
