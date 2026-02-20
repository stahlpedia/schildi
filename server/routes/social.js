const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const { renderTemplate } = require('../lib/renderer');
const fs = require('fs');
const path = require('path');

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://openclaw:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ============================================================
// Content Profile (project-scoped via settings key)
// ============================================================

// GET /api/social/profile OR /api/projects/:projectId/social/profile
router.get('/profile', (req, res) => {
  const projectId = req.params.projectId || req.query.project_id;
  const key = projectId ? `social_profile_${projectId}` : 'social_profile';
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!setting) {
      // Fallback to global profile
      const global = db.prepare('SELECT value FROM settings WHERE key = ?').get('social_profile');
      return res.json(global ? JSON.parse(global.value) : { topics: [], targetAudience: '', tone: '', platforms: [], postingFrequency: '', notes: '' });
    }
    res.json(JSON.parse(setting.value));
  } catch (error) {
    console.error('Get social profile error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Content-Profils' });
  }
});

router.put('/profile', (req, res) => {
  const projectId = req.params.projectId || req.query.project_id;
  const key = projectId ? `social_profile_${projectId}` : 'social_profile';
  try {
    const profile = {
      topics: req.body.topics || [],
      targetAudience: req.body.targetAudience || '',
      tone: req.body.tone || '',
      platforms: req.body.platforms || [],
      postingFrequency: req.body.postingFrequency || '',
      notes: req.body.notes || ''
    };
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (existing) {
      db.prepare('UPDATE settings SET value = ?, updated_at = datetime("now") WHERE key = ?').run(JSON.stringify(profile), key);
    } else {
      db.prepare('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))').run(key, JSON.stringify(profile));
    }
    res.json(profile);
  } catch (error) {
    console.error('Save social profile error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern des Content-Profils' });
  }
});

// ============================================================
// Social Channels (per project)
// ============================================================

router.get('/channels', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const channels = db.prepare('SELECT * FROM social_channels WHERE project_id = ? ORDER BY position ASC, id ASC').all(projectId);
  res.json(channels);
});

router.post('/channels', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { name, type, config = '{}', position = 0 } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name und type erforderlich' });
  const result = db.prepare('INSERT INTO social_channels (project_id, name, type, config, position) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, name, type, typeof config === 'string' ? config : JSON.stringify(config), position);
  const ch = db.prepare('SELECT * FROM social_channels WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ch);
});

router.put('/channels/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM social_channels WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name, type, config, position } = req.body;
  db.prepare('UPDATE social_channels SET name=?, type=?, config=?, position=? WHERE id=?')
    .run(name ?? ch.name, type ?? ch.type, config !== undefined ? (typeof config === 'string' ? config : JSON.stringify(config)) : ch.config, position ?? ch.position, req.params.id);
  res.json(db.prepare('SELECT * FROM social_channels WHERE id = ?').get(req.params.id));
});

router.delete('/channels/:id', (req, res) => {
  db.prepare('DELETE FROM social_channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// Social Folders (per project)
// ============================================================

router.get('/folders', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { channel_id } = req.query;
  let sql = `SELECT f.*, (SELECT COUNT(*) FROM social_assets WHERE folder_id = f.id) as asset_count
    FROM social_folders f WHERE f.project_id = ?`;
  const params = [projectId];
  if (channel_id) { sql += ' AND f.channel_id = ?'; params.push(channel_id); }
  sql += ' ORDER BY f.position ASC, f.id ASC';
  const folders = db.prepare(sql).all(...params);
  res.json(folders);
});

router.post('/folders', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { name, parent_id, position = 0, channel_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const result = db.prepare('INSERT INTO social_folders (project_id, name, parent_id, position, channel_id) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, name.trim(), parent_id || null, position, channel_id || null);
  res.status(201).json(db.prepare('SELECT * FROM social_folders WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/folders/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM social_folders WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name, parent_id, position } = req.body;
  db.prepare('UPDATE social_folders SET name=?, parent_id=?, position=? WHERE id=?')
    .run(name ?? f.name, parent_id !== undefined ? parent_id : f.parent_id, position ?? f.position, req.params.id);
  res.json(db.prepare('SELECT * FROM social_folders WHERE id = ?').get(req.params.id));
});

router.delete('/folders/:id', (req, res) => {
  // Delete assets in folder first
  const assets = db.prepare('SELECT id FROM social_assets WHERE folder_id = ?').all(req.params.id);
  for (const a of assets) {
    db.prepare('DELETE FROM social_asset_media WHERE asset_id = ?').run(a.id);
  }
  db.prepare('DELETE FROM social_assets WHERE folder_id = ?').run(req.params.id);
  db.prepare('DELETE FROM social_folders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// Social Assets (content packages)
// ============================================================

router.get('/assets', (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const { folder_id, status } = req.query;
  let sql = `SELECT a.* FROM social_assets a JOIN social_folders f ON a.folder_id = f.id WHERE f.project_id = ?`;
  const params = [projectId];
  if (folder_id) { sql += ' AND a.folder_id = ?'; params.push(folder_id); }
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  sql += ' ORDER BY a.created_at DESC';
  const assets = db.prepare(sql).all(...params);
  res.json(assets.map(a => ({ ...a, target_channels: JSON.parse(a.target_channels || '[]') })));
});

router.post('/assets', (req, res) => {
  const { folder_id, title, content = '', image_prompt = '', notes = '', status = 'draft', target_channels = [] } = req.body;
  if (!folder_id || !title) return res.status(400).json({ error: 'folder_id und title erforderlich' });
  const result = db.prepare('INSERT INTO social_assets (folder_id, title, content, image_prompt, notes, status, target_channels) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(folder_id, title, content, image_prompt, notes, status, JSON.stringify(target_channels));
  const asset = db.prepare('SELECT * FROM social_assets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...asset, target_channels: JSON.parse(asset.target_channels || '[]') });
});

router.get('/assets/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM social_assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Nicht gefunden' });
  const media = db.prepare(`
    SELECT sam.*, mf.filename, mf.filepath, mf.mimetype, mf.size
    FROM social_asset_media sam
    JOIN media_files mf ON sam.media_file_id = mf.id
    WHERE sam.asset_id = ?
    ORDER BY sam.position ASC
  `).all(req.params.id);
  res.json({ ...asset, target_channels: JSON.parse(asset.target_channels || '[]'), media });
});

router.put('/assets/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM social_assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Nicht gefunden' });
  const { title, content, image_prompt, notes, status, target_channels, folder_id } = req.body;
  db.prepare(`UPDATE social_assets SET title=?, content=?, image_prompt=?, notes=?, status=?, target_channels=?, folder_id=?, updated_at=datetime('now') WHERE id=?`)
    .run(
      title ?? asset.title, content ?? asset.content, image_prompt ?? asset.image_prompt,
      notes ?? asset.notes, status ?? asset.status,
      JSON.stringify(target_channels ?? JSON.parse(asset.target_channels || '[]')),
      folder_id ?? asset.folder_id, req.params.id
    );
  const updated = db.prepare('SELECT * FROM social_assets WHERE id = ?').get(req.params.id);
  res.json({ ...updated, target_channels: JSON.parse(updated.target_channels || '[]') });
});

router.delete('/assets/:id', (req, res) => {
  db.prepare('DELETE FROM social_asset_media WHERE asset_id = ?').run(req.params.id);
  db.prepare('DELETE FROM social_assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/projects/:projectId/social/assets/:id/media — attach media
router.post('/assets/:id/media', (req, res) => {
  const { media_file_id, type = 'image', position = 0 } = req.body;
  if (!media_file_id) return res.status(400).json({ error: 'media_file_id erforderlich' });
  const asset = db.prepare('SELECT id FROM social_assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset nicht gefunden' });
  const result = db.prepare('INSERT INTO social_asset_media (asset_id, media_file_id, type, position) VALUES (?, ?, ?, ?)')
    .run(req.params.id, media_file_id, type, position);
  res.status(201).json(db.prepare('SELECT * FROM social_asset_media WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/assets/:assetId/media/:mediaId', (req, res) => {
  db.prepare('DELETE FROM social_asset_media WHERE id = ? AND asset_id = ?').run(req.params.mediaId, req.params.assetId);
  res.json({ ok: true });
});

// ============================================================
// PNG Render API (kept from old social.js)
// ============================================================

router.post('/render', async (req, res) => {
  try {
    const { template, data, width, height, scale } = req.body;
    if (!template || !data) return res.status(400).json({ error: 'Template und data sind erforderlich' });
    const png = await renderTemplate(template, data, width, height, scale);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', png.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (error) {
    console.error('Render template error:', error);
    res.status(500).json({ error: `Fehler beim Rendern: ${error.message}` });
  }
});

router.post('/render/preview', async (req, res) => {
  try {
    const { template, data, width, height } = req.body;
    if (!template || !data) return res.status(400).json({ error: 'Template und data sind erforderlich' });
    const png = await renderTemplate(template, data, width || 1080, height || 1080, 1);
    const base64 = Buffer.from(png).toString('base64');
    res.json({ image: `data:image/png;base64,${base64}` });
  } catch (error) {
    console.error('Render preview error:', error);
    res.status(500).json({ error: `Fehler beim Rendern der Vorschau: ${error.message}` });
  }
});

router.post('/render/save', async (req, res) => {
  try {
    const { template, data, width, height, scale, filename, project_id } = req.body;
    if (!template || !data) return res.status(400).json({ error: 'Template und data sind erforderlich' });
    const pid = project_id || db.DEFAULT_PROJECT_ID;
    const png = await renderTemplate(template, data, width, height, scale);

    // Find or create "Generiert" context folder
    let folder = db.prepare("SELECT id FROM context_folders WHERE name = 'Generiert' AND is_system = 1 AND project_id = ?").get(pid);
    if (!folder) {
      const r = db.prepare("INSERT INTO context_folders (project_id, name, type, is_system) VALUES (?, 'Generiert', 'system', 1)").run(pid);
      folder = { id: r.lastInsertRowid };
    }

    const fname = filename || `social-${template}-${Date.now()}.png`;
    const baseMediaDir = process.env.MEDIA_DIR || path.join(__dirname, '../../data/media');

    // Insert DB record first to get ID
    const result = db.prepare(`
      INSERT INTO media_files (project_id, folder_id, filename, filepath, mimetype, size, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(pid, folder.id, fname, '', 'image/png', png.length, JSON.stringify(['generated', template]));

    const fileId = result.lastInsertRowid;
    const storedName = `${fileId}_${fname}`;
    const mediaSubDir = path.join(baseMediaDir, String(folder.id));
    fs.mkdirSync(mediaSubDir, { recursive: true });
    const filepath = path.join(mediaSubDir, storedName);
    fs.writeFileSync(filepath, png);

    db.prepare('UPDATE media_files SET filepath = ? WHERE id = ?').run(filepath, fileId);

    res.json({ id: fileId, filename: fname, size: png.length, folder: 'Generiert', template });
  } catch (error) {
    console.error('Render save error:', error);
    res.status(500).json({ error: `Fehler beim Speichern: ${error.message}` });
  }
});

module.exports = router;
