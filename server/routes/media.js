const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = Router();
router.use(authenticate);

// Media directory: shared volume between OpenClaw and Dashboard
const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, '..', 'data', 'media');
fs.mkdirSync(mediaDir, { recursive: true });

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderId = req.body.folderId || '1';
    const folderPath = path.join(mediaDir, folderId);
    fs.mkdirSync(folderPath, { recursive: true });
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Dateityp nicht unterstützt'), false);
    }
  }
});

// === Folders ===

router.get('/folders', (req, res) => {
  const folders = db.prepare(`
    SELECT f.*, 
           (SELECT COUNT(*) FROM media_files WHERE folder_id = f.id) as file_count
    FROM media_folders f 
    ORDER BY is_system DESC, name ASC
  `).all();
  res.json(folders);
});

router.post('/folders', (req, res) => {
  const { name, parent_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  
  try {
    const result = db.prepare('INSERT INTO media_folders (name, parent_id) VALUES (?, ?)').run(name.trim(), parent_id || null);
    const folder = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(folder);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Ordners' });
  }
});

router.put('/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Ordner nicht gefunden' });
  if (folder.is_system) return res.status(400).json({ error: 'System-Ordner können nicht bearbeitet werden' });
  
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  
  try {
    db.prepare('UPDATE media_folders SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    const updated = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Ordners' });
  }
});

router.delete('/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Ordner nicht gefunden' });
  if (folder.is_system) return res.status(400).json({ error: 'System-Ordner können nicht gelöscht werden' });
  
  // Check if folder has files
  const fileCount = db.prepare('SELECT COUNT(*) as c FROM media_files WHERE folder_id = ?').get(req.params.id);
  if (fileCount.c > 0) {
    const { confirm } = req.query;
    if (confirm !== 'true') {
      return res.status(400).json({ 
        error: 'Ordner enthält Dateien. Mit ?confirm=true alle Dateien mit löschen.',
        fileCount: fileCount.c 
      });
    }
    
    // Delete all files in the folder
    const files = db.prepare('SELECT * FROM media_files WHERE folder_id = ?').all(req.params.id);
    for (const file of files) {
      try {
        fs.unlinkSync(file.filepath);
      } catch (e) {
        console.warn('Could not delete file:', file.filepath, e.message);
      }
    }
    db.prepare('DELETE FROM media_files WHERE folder_id = ?').run(req.params.id);
  }
  
  // Delete the folder directory if it exists
  const folderPath = path.join(mediaDir, req.params.id);
  try {
    fs.rmSync(folderPath, { recursive: true, force: true });
  } catch (e) {
    console.warn('Could not delete folder directory:', folderPath, e.message);
  }
  
  db.prepare('DELETE FROM media_folders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// === Files ===

router.get('/files', (req, res) => {
  const { folder_id, search, tag } = req.query;
  
  let query = 'SELECT * FROM media_files WHERE 1=1';
  const params = [];
  
  if (folder_id) {
    query += ' AND folder_id = ?';
    params.push(folder_id);
  }
  
  if (search) {
    query += ' AND filename LIKE ?';
    params.push(`%${search}%`);
  }
  
  if (tag) {
    query += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const files = db.prepare(query).all(...params);
  res.json(files);
});

router.post('/files/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
  
  const { folderId = '1', tags = '[]' } = req.body;
  let parsedTags;
  try {
    parsedTags = JSON.parse(tags);
  } catch {
    parsedTags = [];
  }
  
  // Try to get image dimensions with sharp if available
  let width = null;
  let height = null;
  if (req.file.mimetype.startsWith('image/')) {
    try {
      const sharp = require('sharp');
      const metadata = sharp(req.file.path).metadata();
      metadata.then(info => {
        width = info.width;
        height = info.height;
        
        // Update the database record with dimensions
        db.prepare('UPDATE media_files SET width = ?, height = ? WHERE id = ?')
          .run(width, height, result.lastInsertRowid);
      }).catch(() => {
        // Sharp not available or error - continue without dimensions
      });
    } catch {
      // Sharp not available - continue without dimensions
    }
  }
  
  try {
    const result = db.prepare(`
      INSERT INTO media_files (folder_id, filename, filepath, mimetype, size, width, height, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      folderId,
      req.file.originalname,
      req.file.path,
      req.file.mimetype,
      req.file.size,
      width,
      height,
      JSON.stringify(parsedTags)
    );
    
    const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(file);
  } catch (error) {
    // Clean up uploaded file on database error
    fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Fehler beim Speichern der Datei-Informationen' });
  }
});

router.put('/files/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  
  const { tags, alt_text } = req.body;
  
  let parsedTags = file.tags;
  if (tags !== undefined) {
    try {
      parsedTags = JSON.stringify(Array.isArray(tags) ? tags : JSON.parse(tags));
    } catch {
      return res.status(400).json({ error: 'Ungültiges Tags-Format' });
    }
  }
  
  try {
    db.prepare('UPDATE media_files SET tags = ?, alt_text = ? WHERE id = ?')
      .run(parsedTags, alt_text !== undefined ? alt_text : file.alt_text, req.params.id);
    
    const updated = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Datei' });
  }
});

router.delete('/files/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
  
  // Delete physical file
  try {
    fs.unlinkSync(file.filepath);
  } catch (e) {
    console.warn('Could not delete file:', file.filepath, e.message);
  }
  
  // Delete database record
  db.prepare('DELETE FROM media_files WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;