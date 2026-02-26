/**
 * Skill Sync: Sends the bundled OpenClaw skill to the connected OpenClaw instance
 * on startup if the skill has changed (based on content hash).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKILL_PATH = path.join(__dirname, '..', '..', 'docs', 'openclaw-skill', 'SKILL.md');
const HASH_FILE = path.join(__dirname, '..', '..', 'data', '.skill-hash');

function getSkillHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function getLastSyncedHash() {
  try { return fs.readFileSync(HASH_FILE, 'utf-8').trim(); } catch { return null; }
}

function saveHash(hash) {
  const dir = path.dirname(HASH_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HASH_FILE, hash, 'utf-8');
}

async function syncSkill() {
  const openclawUrl = process.env.OPENCLAW_URL;
  const openclawToken = process.env.OPENCLAW_TOKEN;

  if (!openclawUrl || !openclawToken) {
    console.log('[skill-sync] OPENCLAW_URL or OPENCLAW_TOKEN not set, skipping skill sync');
    return;
  }

  if (!fs.existsSync(SKILL_PATH)) {
    console.log('[skill-sync] No skill file found at', SKILL_PATH);
    return;
  }

  const skillContent = fs.readFileSync(SKILL_PATH, 'utf-8');
  const currentHash = getSkillHash(skillContent);
  const lastHash = getLastSyncedHash();

  if (currentHash === lastHash) {
    console.log('[skill-sync] Skill unchanged, skipping');
    return;
  }

  console.log('[skill-sync] Skill changed, sending update to OpenClaw...');

  const prompt = `Das Schildi Dashboard wurde aktualisiert. Der Dashboard-Skill muss angepasst werden.

Bitte aktualisiere die Datei skills/schildi-dashboard/SKILL.md mit dem folgenden Inhalt.
Vergleiche vorher kurz, was sich geändert hat, und bestätige die Aktualisierung im Slack-Chat an den Nutzer.
Fasse die Änderungen in 1-3 Sätzen zusammen.

Neuer Skill-Inhalt:

${skillContent}`;

  try {
    const res = await fetch(`${openclawUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openclawToken}`
      },
      body: JSON.stringify({
        model: 'default',
        user: 'schildi-dashboard-skill-sync',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (res.ok) {
      saveHash(currentHash);
      console.log('[skill-sync] Skill update sent successfully');
    } else {
      const text = await res.text();
      console.error('[skill-sync] OpenClaw responded with', res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error('[skill-sync] Failed to send skill update:', err.message);
  }
}

module.exports = { syncSkill };
