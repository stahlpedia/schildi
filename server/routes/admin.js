const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../auth');

const router = express.Router();
const execAsync = promisify(exec);

// Ensure temp and branding directories exist
const tempDir = path.join(__dirname, '../../temp/');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const brandingDir = path.join(__dirname, '../../data/branding/');
if (!fs.existsSync(brandingDir)) {
  fs.mkdirSync(brandingDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ 
  dest: tempDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Configure multer for branding logo uploads (2MB limit)
const uploadLogo = multer({ 
  dest: tempDir,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder sind erlaubt (PNG, JPG, SVG, WebP)'));
    }
  }
});

// Serve logo file BEFORE auth middleware (loaded via <img src>, no token)
router.get('/branding/logo-file', (req, res) => {
  try {
    const logoRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_logo_path');
    
    if (!logoRow || !logoRow.value || !fs.existsSync(logoRow.value)) {
      return res.status(404).json({ error: 'Logo nicht gefunden' });
    }
    
    const logoPath = logoRow.value;
    const extension = path.extname(logoPath).toLowerCase();
    
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp'
    };
    
    const contentType = contentTypes[extension] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const stream = fs.createReadStream(logoPath);
    stream.pipe(res);
  } catch (error) {
    console.error('Logo serve error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Logos' });
  }
});

// All admin endpoints require authentication
router.use(authenticate);

// Change password
router.put('/password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Altes und neues Passwort sind erforderlich' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen lang sein' });
    }
    
    // Get current user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });
    }
    
    // Update password
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    
    res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// Get branding settings
router.get('/branding', (req, res) => {
  try {
    const titleRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_title');
    const logoRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_logo_path');
    
    const title = titleRow ? titleRow.value : 'Schildi Dashboard';
    const logoUrl = logoRow ? '/api/admin/branding/logo-file' : null;
    
    res.json({ title, logoUrl });
  } catch (error) {
    console.error('Branding get error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Branding-Einstellungen' });
  }
});

// Update branding settings (title)
router.put('/branding', (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Titel ist erforderlich' });
    }
    
    // Insert or update title
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('branding_title', title.trim());
    
    res.json({ message: 'Titel erfolgreich aktualisiert' });
  } catch (error) {
    console.error('Branding update error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Titels' });
  }
});

// Upload logo
router.post('/branding/logo', uploadLogo.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Logo-Datei hochgeladen' });
    }
    
    const originalName = req.file.originalname;
    const extension = path.extname(originalName).toLowerCase();
    const newFilename = `logo${extension}`;
    const finalPath = path.join(brandingDir, newFilename);
    
    // Remove old logo files
    const logoFiles = fs.readdirSync(brandingDir).filter(file => file.startsWith('logo.'));
    logoFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(brandingDir, file));
      } catch {}
    });
    
    // Copy uploaded file to final location (copyFile to handle cross-device)
    fs.copyFileSync(req.file.path, finalPath);
    try { fs.unlinkSync(req.file.path); } catch {}
    
    // Save path to database
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('branding_logo_path', finalPath);
    
    res.json({ message: 'Logo erfolgreich hochgeladen', logoUrl: '/api/admin/branding/logo-file' });
  } catch (error) {
    console.error('Logo upload error:', error);
    
    // Clean up uploaded file if something went wrong
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Fehler beim Upload des Logos' });
  }
});

// Delete logo
router.delete('/branding/logo', (req, res) => {
  try {
    const logoRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('branding_logo_path');
    
    if (logoRow && logoRow.value && fs.existsSync(logoRow.value)) {
      fs.unlinkSync(logoRow.value);
    }
    
    // Remove from database
    db.prepare('DELETE FROM settings WHERE key = ?').run('branding_logo_path');
    
    res.json({ message: 'Logo erfolgreich entfernt' });
  } catch (error) {
    console.error('Logo delete error:', error);
    res.status(500).json({ error: 'Fehler beim Entfernen des Logos' });
  }
});

// (logo-file endpoint moved before auth middleware above)

// Get system information
router.get('/system-info', async (req, res) => {
  try {
    // Database statistics
    const tasks = db.prepare('SELECT COUNT(*) as count FROM cards').get().count;
    const messages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
    const attachments = db.prepare('SELECT COUNT(*) as count FROM attachments').get().count;
    
    // Attachment storage size
    const attachmentDir = path.join(__dirname, '../../data/attachments/');
    let attachmentSize = '0 B';
    if (fs.existsSync(attachmentDir)) {
      try {
        const { stdout } = await execAsync(`du -sh "${attachmentDir}"`);
        attachmentSize = stdout.split('\t')[0];
      } catch {
        attachmentSize = 'N/A';
      }
    }
    
    // Check OpenClaw status
    let openclawStatus = false;
    try {
      const openclawUrl = process.env.OPENCLAW_URL || 'http://localhost:8080';
      const fetch = require('node-fetch');
      const response = await fetch(`${openclawUrl}/health`, { timeout: 3000 });
      openclawStatus = response.ok;
    } catch {
      openclawStatus = false;
    }
    
    res.json({
      db_stats: {
        tasks,
        messages,
        attachments
      },
      attachment_size: attachmentSize,
      openclaw_status: openclawStatus
    });
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der System-Informationen' });
  }
});

// Backup database
router.get('/backup/db', (req, res) => {
  try {
    const dbPath = path.join(__dirname, '../../data/schildi.db');
    
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Datenbank-Datei nicht gefunden' });
    }
    
    res.setHeader('Content-Disposition', 'attachment; filename="schildi.db"');
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const stream = fs.createReadStream(dbPath);
    stream.pipe(res);
  } catch (error) {
    console.error('DB backup error:', error);
    res.status(500).json({ error: 'Fehler beim Backup der Datenbank' });
  }
});

// Backup workspace
router.get('/backup/workspace', async (req, res) => {
  try {
    const workspaceDir = process.env.WORKSPACE_DIR || '/home/node/.openclaw/workspace';
    const tempFile = path.join(tempDir, `workspace-${Date.now()}.tar.gz`);
    
    if (!fs.existsSync(workspaceDir)) {
      return res.status(404).json({ error: 'Workspace-Verzeichnis nicht gefunden' });
    }
    
    await execAsync(`tar -czf "${tempFile}" -C "${path.dirname(workspaceDir)}" "${path.basename(workspaceDir)}"`);
    
    res.setHeader('Content-Disposition', 'attachment; filename="workspace.tar.gz"');
    res.setHeader('Content-Type', 'application/gzip');
    
    const stream = fs.createReadStream(tempFile);
    stream.pipe(res);
    
    // Clean up temp file after sending
    stream.on('end', () => {
      fs.unlink(tempFile, () => {});
    });
  } catch (error) {
    console.error('Workspace backup error:', error);
    res.status(500).json({ error: 'Fehler beim Backup des Workspace' });
  }
});

// Backup attachments
router.get('/backup/attachments', async (req, res) => {
  try {
    const attachmentDir = path.join(__dirname, '../../data/attachments/');
    const tempFile = path.join(tempDir, `attachments-${Date.now()}.tar.gz`);
    
    if (!fs.existsSync(attachmentDir)) {
      return res.status(404).json({ error: 'Attachment-Verzeichnis nicht gefunden' });
    }
    
    await execAsync(`tar -czf "${tempFile}" -C "${path.dirname(attachmentDir)}" "${path.basename(attachmentDir)}"`);
    
    res.setHeader('Content-Disposition', 'attachment; filename="attachments.tar.gz"');
    res.setHeader('Content-Type', 'application/gzip');
    
    const stream = fs.createReadStream(tempFile);
    stream.pipe(res);
    
    // Clean up temp file after sending
    stream.on('end', () => {
      fs.unlink(tempFile, () => {});
    });
  } catch (error) {
    console.error('Attachments backup error:', error);
    res.status(500).json({ error: 'Fehler beim Backup der Attachments' });
  }
});

// Restore database
router.post('/restore/db', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const uploadedPath = req.file.path;
    const dbPath = path.join(__dirname, '../../data/schildi.db');
    const backupPath = path.join(__dirname, '../../data/schildi.db.backup');
    
    // Create backup of current database
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
    
    // Replace database
    fs.copyFileSync(uploadedPath, dbPath);
    
    // Clean up uploaded file
    fs.unlinkSync(uploadedPath);
    
    res.json({ message: 'Datenbank erfolgreich wiederhergestellt' });
  } catch (error) {
    console.error('DB restore error:', error);
    
    // Try to restore backup if something went wrong
    const dbPath = path.join(__dirname, '../../data/schildi.db');
    const backupPath = path.join(__dirname, '../../data/schildi.db.backup');
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, dbPath);
      } catch {}
    }
    
    res.status(500).json({ error: 'Fehler beim Wiederherstellen der Datenbank' });
  }
});

// Restore workspace
router.post('/restore/workspace', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const uploadedPath = req.file.path;
    const workspaceDir = process.env.WORKSPACE_DIR || '/home/node/.openclaw/workspace';
    const parentDir = path.dirname(workspaceDir);
    
    // Extract tar.gz to parent directory (will overwrite workspace contents)
    await execAsync(`tar -xzf "${uploadedPath}" -C "${parentDir}"`);
    
    // Clean up uploaded file
    fs.unlinkSync(uploadedPath);
    
    res.json({ message: 'Workspace erfolgreich wiederhergestellt' });
  } catch (error) {
    console.error('Workspace restore error:', error);
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Fehler beim Wiederherstellen des Workspace' });
  }
});

module.exports = router;