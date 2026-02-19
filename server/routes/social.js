const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://openclaw:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

const router = Router();
router.use(authenticate);

// Initialize social_posts table
db.exec(`
  CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idea',
    scheduled_date TEXT,
    published_date TEXT,
    image_media_id INTEGER,
    hashtags TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// === Content-Profil API ===

// GET /api/social/profile — Content-Profil laden
router.get('/profile', (req, res) => {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('social_profile');
    if (!setting) {
      // Default profile structure
      const defaultProfile = {
        topics: [],
        targetAudience: '',
        tone: '',
        platforms: [],
        postingFrequency: '',
        notes: ''
      };
      return res.json(defaultProfile);
    }
    
    const profile = JSON.parse(setting.value);
    res.json(profile);
  } catch (error) {
    console.error('Get social profile error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Content-Profils' });
  }
});

// PUT /api/social/profile — Content-Profil speichern
router.put('/profile', (req, res) => {
  try {
    const { topics, targetAudience, tone, platforms, postingFrequency, notes } = req.body;
    
    const profile = {
      topics: topics || [],
      targetAudience: targetAudience || '',
      tone: tone || '',
      platforms: platforms || [],
      postingFrequency: postingFrequency || '',
      notes: notes || ''
    };

    // Update or insert profile
    const existing = db.prepare('SELECT id FROM settings WHERE key = ?').get('social_profile');
    if (existing) {
      db.prepare('UPDATE settings SET value = ?, updated_at = datetime("now") WHERE key = ?')
        .run(JSON.stringify(profile), 'social_profile');
    } else {
      db.prepare('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))')
        .run('social_profile', JSON.stringify(profile));
    }

    res.json(profile);
  } catch (error) {
    console.error('Save social profile error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern des Content-Profils' });
  }
});

// === Social Posts API ===

// GET /api/social/posts — Posts auflisten
router.get('/posts', (req, res) => {
  try {
    const { platform, status, month } = req.query;
    
    let sql = 'SELECT * FROM social_posts WHERE 1=1';
    const params = [];
    
    if (platform && platform !== 'all') {
      sql += ' AND platform = ?';
      params.push(platform);
    }
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    if (month) {
      // Filter by month (YYYY-MM format)
      sql += ' AND (scheduled_date LIKE ? OR created_at LIKE ?)';
      params.push(`${month}%`);
      params.push(`${month}%`);
    }
    
    sql += ' ORDER BY scheduled_date ASC, created_at ASC';
    
    const posts = db.prepare(sql).all(...params);
    
    // Parse hashtags JSON
    const postsWithHashtags = posts.map(post => ({
      ...post,
      hashtags: JSON.parse(post.hashtags || '[]')
    }));
    
    res.json(postsWithHashtags);
  } catch (error) {
    console.error('Get social posts error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Posts' });
  }
});

// POST /api/social/posts — Post erstellen
router.post('/posts', (req, res) => {
  try {
    const { 
      title, 
      content = '', 
      platform, 
      status = 'idea', 
      scheduled_date, 
      published_date, 
      image_media_id, 
      hashtags = [], 
      notes = '' 
    } = req.body;
    
    if (!title || !platform) {
      return res.status(400).json({ error: 'Titel und Plattform sind erforderlich' });
    }
    
    const result = db.prepare(`
      INSERT INTO social_posts (
        title, content, platform, status, scheduled_date, published_date, 
        image_media_id, hashtags, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, content, platform, status, scheduled_date || null, 
      published_date || null, image_media_id || null, 
      JSON.stringify(hashtags), notes
    );
    
    const newPost = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...newPost,
      hashtags: JSON.parse(newPost.hashtags || '[]')
    });
  } catch (error) {
    console.error('Create social post error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Posts' });
  }
});

// PUT /api/social/posts/:id — Post bearbeiten
router.put('/posts/:id', (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post nicht gefunden' });
    }
    
    const { 
      title, 
      content, 
      platform, 
      status, 
      scheduled_date, 
      published_date, 
      image_media_id, 
      hashtags, 
      notes 
    } = req.body;
    
    db.prepare(`
      UPDATE social_posts SET 
        title = ?, content = ?, platform = ?, status = ?, 
        scheduled_date = ?, published_date = ?, image_media_id = ?, 
        hashtags = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ?? post.title,
      content ?? post.content,
      platform ?? post.platform,
      status ?? post.status,
      scheduled_date ?? post.scheduled_date,
      published_date ?? post.published_date,
      image_media_id ?? post.image_media_id,
      JSON.stringify(hashtags ?? JSON.parse(post.hashtags || '[]')),
      notes ?? post.notes,
      req.params.id
    );
    
    const updated = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id);
    res.json({
      ...updated,
      hashtags: JSON.parse(updated.hashtags || '[]')
    });
  } catch (error) {
    console.error('Update social post error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Posts' });
  }
});

// DELETE /api/social/posts/:id — Post löschen
router.delete('/posts/:id', (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post nicht gefunden' });
    }
    
    db.prepare('DELETE FROM social_posts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete social post error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Posts' });
  }
});

// POST /api/social/generate-plan — Redaktionsplan generieren
router.post('/generate-plan', async (req, res) => {
  try {
    const { timeframe, platform } = req.body;
    
    if (!OPENCLAW_TOKEN) {
      return res.status(500).json({ error: 'OpenClaw Token nicht konfiguriert' });
    }
    
    // Load content profile
    const profileSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('social_profile');
    let profile = { topics: [], targetAudience: '', tone: '', platforms: [], postingFrequency: '', notes: '' };
    if (profileSetting) {
      try {
        profile = JSON.parse(profileSetting.value);
      } catch (e) {
        console.warn('Failed to parse social profile:', e);
      }
    }
    
    // Build prompt with context
    let prompt = `Erstelle einen Social Media Redaktionsplan für ${timeframe || 'diese Woche'}`;
    
    if (platform && platform !== 'all') {
      prompt += ` für die Plattform ${platform}`;
    }
    
    prompt += '.\n\nContent-Profil:';
    if (profile.topics.length > 0) {
      prompt += `\nThemen: ${profile.topics.join(', ')}`;
    }
    if (profile.targetAudience) {
      prompt += `\nZielgruppe: ${profile.targetAudience}`;
    }
    if (profile.tone) {
      prompt += `\nTonalität: ${profile.tone}`;
    }
    if (profile.postingFrequency) {
      prompt += `\nPosting-Frequenz: ${profile.postingFrequency}`;
    }
    if (profile.notes) {
      prompt += `\nWeitere Notizen: ${profile.notes}`;
    }
    
    prompt += `\n\nErstelle 5-10 konkrete Post-Ideen. Für jeden Post gib zurück:
- Titel (max 50 Zeichen)
- Content-Skizze (50-100 Wörter)
- Empfohlenes Datum (YYYY-MM-DD)
- Passende Hashtags (3-5 Stück)
- Plattform-spezifische Anpassungen

Format die Antwort als strukturierte Liste, damit ich die Posts einzeln als "idea" Status ins System eintragen kann.`;

    const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json',
        'x-openclaw-agent-id': 'main'
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: [{
          role: 'user',
          content: prompt
        }],
        user: `schildi-dashboard-social-gen`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `OpenClaw Fehler: ${response.status} - ${errorText}` });
    }

    const data = await response.json();
    const generatedPlan = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten';

    // Try to parse structured response and create posts automatically
    // For now, just return the generated plan - the frontend can handle creation
    res.json({ 
      success: true, 
      plan: generatedPlan,
      profile: profile
    });

  } catch (error) {
    console.error('Generate plan error:', error);
    res.status(500).json({ error: `Fehler beim Generieren des Plans: ${error.message}` });
  }
});

module.exports = router;