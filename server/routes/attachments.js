const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../auth');
const db = require('../db');

const router = express.Router();

// Ensure attachments directory exists
const attachmentsDir = path.join(__dirname, '..', 'data', 'attachments');
if (!fs.existsSync(attachmentsDir)) {
  fs.mkdirSync(attachmentsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, attachmentsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, uniqueSuffix + '-' + basename + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// POST /api/attachments/upload - Upload file and create attachment record
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { entity_type, entity_id } = req.body;
  
  if (!entity_type || !entity_id) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  if (!['card', 'message'].includes(entity_type)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'entity_type must be card or message' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO attachments (entity_type, entity_id, filename, filepath, mimetype, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entity_type,
      parseInt(entity_id),
      req.file.originalname,
      req.file.filename, // Store just the filename, not full path
      req.file.mimetype,
      req.file.size
    );

    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(attachment);
  } catch (error) {
    // Clean up uploaded file on error
    fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/attachments/:id - Download attachment
router.get('/:id', authenticate, (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const filePath = path.join(attachmentsDir, attachment.filepath);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
  res.setHeader('Content-Type', attachment.mimetype);
  res.sendFile(filePath);
});

// GET /api/attachments - List attachments for entity
router.get('/', authenticate, (req, res) => {
  const { entity_type, entity_id } = req.query;
  
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  const attachments = db.prepare(`
    SELECT id, entity_type, entity_id, filename, mimetype, size, created_at
    FROM attachments 
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(entity_type, parseInt(entity_id));

  res.json(attachments);
});

// DELETE /api/attachments/:id - Delete attachment
router.delete('/:id', authenticate, (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  try {
    // Delete from database
    db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
    
    // Delete file from disk (ignore errors if file doesn't exist)
    const filePath = path.join(attachmentsDir, attachment.filepath);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('Failed to delete attachment file:', err.message);
    }
    
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;