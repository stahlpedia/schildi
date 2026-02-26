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

  const isFirstSync = !lastHash;
  console.log(`[skill-sync] Skill ${isFirstSync ? 'first sync' : 'changed'}, sending update to OpenClaw...`);

  // Gather dashboard connection info from ENV
  const dashboardUser = process.env.DASHBOARD_USER || 'admin';
  const dashboardHost = process.env.DASHBOARD_ID || 'schildi-dashboard';
  const dashboardPort = process.env.PORT || '3333';

  let prompt;

  if (isFirstSync) {
    prompt = `Das Schildi Dashboard wurde zum ersten Mal mit diesem OpenClaw verbunden. Bitte richte alles ein:

1. Erstelle die Datei skills/schildi-dashboard/SKILL.md mit folgendem Inhalt:

${skillContent}

2. Trage folgendes in deine TOOLS.md ein (falls nicht bereits vorhanden), unter einer Sektion "## Schildi Dashboard":

- **Host:** ${dashboardHost}:${dashboardPort} (Docker-intern, IMMER intern zugreifen!)
- **Login:** POST http://${dashboardHost}:${dashboardPort}/api/login
- **Body:** {"username":"${dashboardUser}","password":"$KANBAN_PW"}
- **Auth:** Bearer Token aus Login-Response
- **ENV:** Passwort liegt in Umgebungsvariable $KANBAN_PW

3. Bestätige dem Nutzer im Slack-Chat, dass das Dashboard verbunden wurde und der Skill installiert ist.`;
  } else {
    prompt = `Das Schildi Dashboard wurde aktualisiert. Der Dashboard-Skill muss angepasst werden.

Bitte aktualisiere die Datei skills/schildi-dashboard/SKILL.md mit dem folgenden Inhalt.
Vergleiche vorher kurz, was sich geändert hat, und bestätige die Aktualisierung im Slack-Chat an den Nutzer.
Fasse die Änderungen in 1-3 Sätzen zusammen.

Neuer Skill-Inhalt:

${skillContent}`;
  }

  await sendWithRetry(openclawUrl, openclawToken, prompt, currentHash);
}

async function sendWithRetry(openclawUrl, openclawToken, prompt, hash, attempt = 1, maxAttempts = 5) {
  const delays = [0, 15000, 30000, 60000, 120000]; // 0s, 15s, 30s, 60s, 120s

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
      saveHash(hash);
      console.log('[skill-sync] Skill update sent successfully');
    } else {
      const text = await res.text();
      console.error(`[skill-sync] OpenClaw responded with ${res.status} (attempt ${attempt}/${maxAttempts})`);
      if (attempt < maxAttempts) {
        const delay = delays[attempt] || 60000;
        console.log(`[skill-sync] Retrying in ${delay / 1000}s...`);
        setTimeout(() => sendWithRetry(openclawUrl, openclawToken, prompt, hash, attempt + 1, maxAttempts), delay);
      }
    }
  } catch (err) {
    console.error(`[skill-sync] Failed (attempt ${attempt}/${maxAttempts}):`, err.message);
    if (attempt < maxAttempts) {
      const delay = delays[attempt] || 60000;
      console.log(`[skill-sync] Retrying in ${delay / 1000}s...`);
      setTimeout(() => sendWithRetry(openclawUrl, openclawToken, prompt, hash, attempt + 1, maxAttempts), delay);
    }
  }
}

module.exports = { syncSkill };
