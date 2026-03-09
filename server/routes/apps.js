const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const { spawn } = require('child_process');
const { authenticate } = require('../auth');
const db = require('../db');
const { emit } = require('../lib/events');

const router = Router({ mergeParams: true });
router.use(authenticate);

const APP_RUNNER_URL = process.env.APP_RUNNER_URL || 'http://app-runner:3500';
const APP_RUNNER_KEY = process.env.APP_RUNNER_KEY || '';
const APPS_DIR = process.env.APPS_DIR || '/apps';
const CADDY_API = process.env.CADDY_API || 'http://caddy:2019';
const ACME_EMAIL = process.env.ACME_EMAIL || 'admin@example.com';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'stahlpedia';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const EXPORTS_DIR = '/tmp/schildi-exports';
const GIT_TIMEOUT_MS = 60000;
const MAX_IMPORT_REPO_BYTES = 100 * 1024 * 1024;

const APP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_FILE_SIZE = 1024 * 1024;
const BLOCKED_SEGMENTS = new Set(['node_modules', '.git', '.github']);

function isValidAppName(name) {
  return APP_NAME_RE.test(name || '');
}

function isBlockedRelativePath(relativePath) {
  const parts = (relativePath || '').split('/').filter(Boolean);
  for (const part of parts) {
    if (BLOCKED_SEGMENTS.has(part)) return true;
    if (part === '.env' || part.startsWith('.env.')) return true;
  }
  return false;
}

function safeAppPath(name, relativePath = '') {
  if (!isValidAppName(name)) return null;
  const base = path.resolve(APPS_DIR, name);
  const full = path.resolve(base, relativePath);
  if (!full.startsWith(base + path.sep) && full !== base) return null;
  const rel = path.relative(base, full).split(path.sep).join('/');
  if (isBlockedRelativePath(rel)) return null;
  return { base, full, rel };
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureAppChannel(projectId, appName) {
  const pid = Number(projectId) || db.DEFAULT_PROJECT_ID;
  const slug = `app-${slugify(appName)}`;
  const existing = db.prepare('SELECT id FROM chat_channels WHERE project_id = ? AND slug = ?').get(pid, slug);
  if (existing) return existing.id;
  const name = `App ${appName}`;
  const result = db.prepare('INSERT INTO chat_channels (project_id, name, slug, type, model_id) VALUES (?, ?, ?, ?, ?)')
    .run(pid, name, slug, 'agent', `app:${appName}`);
  return result.lastInsertRowid;
}

function deleteAppChannel(appName) {
  const slug = `app-${slugify(appName)}`;
  const channels = db.prepare('SELECT id FROM chat_channels WHERE slug = ?').all(slug);
  for (const ch of channels) {
    db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE channel_id = ?)').run(ch.id);
    db.prepare('DELETE FROM conversations WHERE channel_id = ?').run(ch.id);
    db.prepare('DELETE FROM chat_channels WHERE id = ?').run(ch.id);
  }
}

function runnerRequest(method, urlPath, body) {
  const url = new URL(urlPath, APP_RUNNER_URL);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (APP_RUNNER_KEY) headers['x-api-key'] = APP_RUNNER_KEY;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          text: () => Promise.resolve(d),
          json: () => Promise.resolve(d ? JSON.parse(d) : null),
        });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function caddyRequest(method, urlPath, body) {
  const url = new URL(urlPath, CADDY_API);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      } : {},
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(d),
          json: () => Promise.resolve(d ? JSON.parse(d) : null),
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function buildAppCaddyRoute(domain, appPort) {
  return {
    '@id': `app_${domain.replace(/\./g, '_')}`,
    match: [{ host: [domain] }],
    handle: [{
      handler: 'subroute',
      routes: [{
        handle: [{
          handler: 'reverse_proxy',
          upstreams: [{ dial: `app-runner:${appPort}` }],
        }],
      }],
    }],
    terminal: true,
  };
}

async function registerCaddyRoute(domain, appPort) {
  const route = buildAppCaddyRoute(domain, appPort);
  try {
    for (let i = 0; i < 20; i++) {
      const delRes = await caddyRequest('DELETE', `/id/app_${domain.replace(/\./g, '_')}`);
      if (!delRes.ok) break;
    }
    const postRes = await caddyRequest('POST', '/config/apps/http/servers/srv0/routes', route);
    if (!postRes.ok) {
      const errText = await postRes.text();
      throw new Error(`Caddy Route fehlgeschlagen: ${postRes.status} ${errText}`);
    }
  } catch (err) {
    throw err;
  }
}

async function removeCaddyRoute(domain) {
  try {
    await caddyRequest('DELETE', `/id/app_${domain.replace(/\./g, '_')}`);
  } catch (e) {
    console.error(`[Caddy] Failed to remove ${domain}:`, e.message);
  }
}

async function syncCaddyTls(subjects) {
  const allSubjects = Array.from(new Set((subjects || []).filter(Boolean)));
  if (allSubjects.length === 0) return;
  await caddyRequest('POST', '/config/apps/tls', {
    automation: {
      policies: [{
        subjects: allSubjects,
        issuers: [
          { module: 'acme', email: ACME_EMAIL },
          { module: 'acme', ca: 'https://acme.zerossl.com/v2/DV90', email: ACME_EMAIL },
        ],
      }],
    },
  });
}

function buildTreeRecursive(dir, base) {
  const name = path.basename(dir);
  const rel = path.relative(base, dir).split(path.sep).join('/');
  const relParts = rel ? rel.split('/').filter(Boolean) : [];
  if (relParts[0] === 'data' && relParts[1] === 'logs') return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const childRel = path.relative(base, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (BLOCKED_SEGMENTS.has(entry.name)) continue;
      if (entry.name === 'data' && childRel === 'data') {
        const sub = buildTreeRecursive(fullPath, base);
        if (sub && Array.isArray(sub.children)) {
          sub.children = sub.children.filter(c => !(c.name === 'logs' && c.type === 'directory'));
        }
        if (sub) children.push(sub);
        continue;
      }
      const childTree = buildTreeRecursive(fullPath, base);
      if (childTree) children.push(childTree);
    } else {
      if (entry.name === '.env' || entry.name.startsWith('.env.')) continue;
      const stat = fs.statSync(fullPath);
      children.push({ name: entry.name, type: 'file', size: stat.size });
    }
  }

  children.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return { name, type: 'directory', children };
}

function runCommand(cmd, args, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timeout`));
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += String(d || ''); });
    child.stderr.on('data', d => { stderr += String(d || ''); });
    child.on('error', err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const err = new Error(`${cmd} failed`);
      err.stdout = stdout;
      err.stderr = stderr;
      err.code = code;
      reject(err);
    });
  });
}

function validateGithubUrl(gitUrl) {
  if (!gitUrl || typeof gitUrl !== 'string') return { ok: false, error: 'git_url ist erforderlich' };
  let parsed = null;
  try {
    parsed = new URL(gitUrl);
  } catch (_) {
    return { ok: false, error: 'git_url ist ungueltig' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Nur https GitHub URLs sind erlaubt' };
  if (parsed.hostname !== 'github.com') return { ok: false, error: 'Nur github.com ist erlaubt' };

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return { ok: false, error: 'GitHub URL muss owner/repo enthalten' };

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) return { ok: false, error: 'GitHub URL muss owner/repo enthalten' };

  return { ok: true, owner, repo, cloneUrl: `https://github.com/${owner}/${repo}.git` };
}

function getDirSizeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  }
  return total;
}

function copyImportSource(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (src) => {
      const rel = path.relative(sourceDir, src).split(path.sep).join('/');
      if (!rel) return true;
      if (rel === '.git' || rel.startsWith('.git/')) return false;
      if (rel === '.github' || rel.startsWith('.github/')) return false;
      if (rel === 'node_modules' || rel.startsWith('node_modules/')) return false;
      if (rel === '.env' || rel.startsWith('.env.')) return false;
      if (isBlockedRelativePath(rel)) return false;
      return true;
    },
  });
}

function extractRunnerPort(details) {
  return details?.port || details?.data?.port || details?.data?.status?.port || details?.app?.port || details?.data?.persisted?.port || null;
}

async function runMigrationAnalysis(appDir, source) {
  const patterns = ['supabase', 'createClient', '.from(', 'auth.'];
  const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);
  const filesWithHits = [];
  let filesScanned = 0;
  const authHintsSet = new Set();
  const tableHintsSet = new Set();
  let supabaseHits = 0;

  const stack = [appDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(appDir, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (isBlockedRelativePath(rel)) continue;
        stack.push(full);
        continue;
      }
      if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
      filesScanned += 1;
      const text = fs.readFileSync(full, 'utf-8');
      const lower = text.toLowerCase();

      let hits = 0;
      for (const p of patterns) {
        let idx = 0;
        const needle = p.toLowerCase();
        while ((idx = lower.indexOf(needle, idx)) !== -1) {
          hits += 1;
          idx += needle.length;
        }
      }
      if (hits === 0) continue;
      if (lower.includes('supabase')) supabaseHits += 1;

      const authMatches = text.match(/auth\.[a-zA-Z0-9_]+/g) || [];
      authMatches.forEach(m => authHintsSet.add(m));

      const fromMatches = text.match(/\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/g) || [];
      for (const m of fromMatches) {
        const table = m.match(/\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/);
        if (table && table[1]) tableHintsSet.add(table[1]);
      }

      if (filesWithHits.length < 30) filesWithHits.push(rel);
    }
  }

  const report = {
    source: source || 'github',
    detected: {
      supabase: supabaseHits > 0,
      authHints: Array.from(authHintsSet).slice(0, 30),
      tableHints: Array.from(tableHintsSet).slice(0, 30),
    },
    filesScanned,
    filesWithHits,
    notes: [
      'Nur Analyse, keine automatische Migration.',
      'Treffer basieren auf einfachen String Mustern.',
    ],
  };

  const reportPath = path.join(appDir, 'migrationsreport.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  return report;
}

async function importFromGithub(body = {}, options = {}) {
  const warnings = [];
  const validation = validateGithubUrl(body.git_url);
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.status = 400;
    throw err;
  }

  const resolvedName = (body.name && String(body.name).trim()) || slugify(validation.repo);
  if (!isValidAppName(resolvedName)) {
    const err = new Error('Ungueltiger App-Name');
    err.status = 400;
    throw err;
  }

  const appDir = path.resolve(APPS_DIR, resolvedName);
  if (!appDir.startsWith(path.resolve(APPS_DIR) + path.sep)) {
    const err = new Error('Ungueltiger Zielpfad');
    err.status = 400;
    throw err;
  }
  if (fs.existsSync(appDir)) {
    const err = new Error('App existiert bereits');
    err.status = 409;
    throw err;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'schildi-app-import-'));
  const cloneDir = path.join(tempRoot, 'repo');

  try {
    await runCommand('git', ['clone', '--depth', '1', validation.cloneUrl, cloneDir], { timeoutMs: GIT_TIMEOUT_MS });

    const repoSize = getDirSizeBytes(cloneDir);
    if (repoSize > MAX_IMPORT_REPO_BYTES) {
      const err = new Error('Repository zu gross (max 100MB)');
      err.status = 400;
      throw err;
    }

    if (!fs.existsSync(path.join(cloneDir, 'package.json'))) {
      const err = new Error('package.json fehlt im Repository');
      err.status = 400;
      throw err;
    }

    fs.mkdirSync(path.resolve(APPS_DIR), { recursive: true });
    copyImportSource(cloneDir, appDir);

    const appJsonPath = path.join(appDir, 'app.json');
    let meta = {};
    if (fs.existsSync(appJsonPath)) {
      try { meta = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8')); } catch (_) { meta = {}; }
    }

    const domain = body.domain ? String(body.domain).trim() : null;
    meta = {
      ...meta,
      name: resolvedName,
      domain: domain || meta.domain || null,
      autostart: meta.autostart === true,
      env: typeof meta.env === 'object' && meta.env ? meta.env : {},
    };
    fs.writeFileSync(appJsonPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

    if (body.install !== false) {
      try {
        const installRes = await runnerRequest('POST', `/apps/${resolvedName}/install`);
        if (!installRes.ok) warnings.push('npm install konnte nicht gestartet werden');
      } catch (_) {
        warnings.push('npm install konnte nicht gestartet werden');
      }
    }

    let runnerInfo = null;
    try {
      const details = await runnerRequest('GET', `/apps/${resolvedName}`);
      if (details.ok) runnerInfo = await details.json().catch(() => null);
      else warnings.push('Runner Status konnte nicht gelesen werden');
    } catch (_) {
      warnings.push('Runner Status konnte nicht gelesen werden');
    }

    const runnerPort = extractRunnerPort(runnerInfo);
    if (meta.domain) {
      if (runnerPort) {
        try {
          await registerCaddyRoute(meta.domain, runnerPort);
          await syncCaddyTls([meta.domain]);
        } catch (_) {
          warnings.push('Domain wurde gesetzt, Caddy Registrierung ist fehlgeschlagen');
        }
      } else {
        warnings.push('Domain gesetzt, aber kein App Port verfuegbar');
      }
    }

    const channelId = ensureAppChannel(body.project_id, resolvedName);
    emit('apps', { action: 'imported', name: resolvedName, domain: meta.domain || null, source: 'github' });

    const result = {
      success: true,
      name: resolvedName,
      domain: meta.domain || null,
      channel_id: channelId,
      warnings,
      source: 'github',
      appDir,
    };

    if (options.migrate === true) {
      const report = await runMigrationAnalysis(appDir, options.source || 'github');
      result.report = {
        source: report.source,
        filesScanned: report.filesScanned,
        filesWithHits: report.filesWithHits.length,
        supabase: report.detected.supabase,
        authHints: report.detected.authHints,
        tableHints: report.detected.tableHints,
      };
    }

    return result;
  } catch (err) {
    if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function pruneExportMeta(meta) {
  const cleaned = { ...(meta || {}) };
  delete cleaned.port;
  delete cleaned.id;
  delete cleaned.internal;
  return cleaned;
}

function defaultReadme(name) {
  return `# ${name}\n\nDiese App wurde ueber das Schildi Dashboard exportiert.\n\n## Voraussetzungen\n\nNode.js 22\n\n## Installation\n\n\`\`\`bash\nnpm install\n\`\`\`\n\n## Start\n\n\`\`\`bash\nnpm start\n\`\`\`\n\n## Umgebungsvariablen\n\nLege bei Bedarf eine .env Datei an und setze die benoetigten Variablen.\nSei vorsichtig mit Secrets und committe keine sensiblen Daten.\n`;
}

function ensureGitignoreContent(current, includeDb) {
  const lines = new Set(String(current || '').split(/\r?\n/).filter(Boolean));
  lines.add('node_modules');
  lines.add('.env');
  lines.add('.env.*');
  if (!includeDb) lines.add('data/*.db');
  return Array.from(lines).sort().join('\n') + '\n';
}

function ensureExportFiles(dir, name, includeDb) {
  const appJsonPath = path.join(dir, 'app.json');
  if (!fs.existsSync(appJsonPath)) throw new Error('app.json fehlt');

  const appMeta = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  const cleaned = pruneExportMeta(appMeta);
  fs.writeFileSync(appJsonPath, JSON.stringify(cleaned, null, 2) + '\n', 'utf-8');

  const readmePath = path.join(dir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, defaultReadme(name), 'utf-8');
  }

  const gitignorePath = path.join(dir, '.gitignore');
  const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  fs.writeFileSync(gitignorePath, ensureGitignoreContent(current, includeDb), 'utf-8');
}

function copyAppForExport(sourceDir, targetDir, includeDb) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(sourceDir, src).split(path.sep).join('/');
      if (!rel) return true;
      if (rel === '.git' || rel.startsWith('.git/')) return false;
      if (!includeDb && /\.db$/i.test(rel)) return false;
      return true;
    },
  });
}

function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'schildi-dashboard-export',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureGithubRepo(owner, repo) {
  const getRes = await githubRequest('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (getRes.ok) return;
  if (getRes.status !== 404) throw new Error('GitHub Repo Pruefung fehlgeschlagen');

  const createRes = await githubRequest('POST', '/user/repos', {
    name: repo,
    private: false,
    auto_init: false,
  });
  if (!createRes.ok && createRes.status !== 422) {
    throw new Error('GitHub Repo Erstellung fehlgeschlagen');
  }
}

async function exportToGithub(name, appDir, includeDb) {
  const owner = GITHUB_OWNER;
  const repo = `app-${name}`;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `schildi-export-${name}-`));
  const tempDir = path.join(tempRoot, name);
  const warnings = [];

  try {
    copyAppForExport(appDir, tempDir, includeDb);
    ensureExportFiles(tempDir, name, includeDb);

    await ensureGithubRepo(owner, repo);

    const hasGit = fs.existsSync(path.join(appDir, '.git'));
    if (!hasGit) warnings.push('App hatte kein lokales Git Repository, Export lief ueber temp Verzeichnis.');

    const remoteUrl = `https://x-access-token:${encodeURIComponent(GITHUB_TOKEN)}@github.com/${owner}/${repo}.git`;

    await runCommand('git', ['init'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    await runCommand('git', ['checkout', '-B', 'main'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    await runCommand('git', ['add', '.'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    try {
      await runCommand('git', ['commit', '-m', 'Export from Schildi Dashboard'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    } catch (err) {
      const stderr = String(err.stderr || '').toLowerCase();
      if (!stderr.includes('nothing to commit')) throw err;
    }

    try {
      await runCommand('git', ['remote', 'remove', 'origin'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    } catch (_) {}
    await runCommand('git', ['remote', 'add', 'origin', remoteUrl], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    await runCommand('git', ['push', '-u', 'origin', 'main', '--force'], { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });

    return { success: true, method: 'github', repo_url: `https://github.com/${owner}/${repo}`, warnings };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function exportToArchive(name, appDir, includeDb) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = path.join(EXPORTS_DIR, `${name}-${ts}.zip`);
  const tgzPath = path.join(EXPORTS_DIR, `${name}-${ts}.tar.gz`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `schildi-export-${name}-`));
  const tempDir = path.join(tempRoot, name);
  const warnings = [];

  try {
    copyAppForExport(appDir, tempDir, includeDb);
    ensureExportFiles(tempDir, name, includeDb);

    try {
      const zipArgs = ['-r', zipPath, '.'];
      if (!includeDb) zipArgs.push('-x', '*.db');
      await runCommand('zip', zipArgs, { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
      return { success: true, method: 'zip', download_path: zipPath, warnings };
    } catch (_) {
      warnings.push('zip nicht verfuegbar, nutze tar.gz Fallback.');
    }

    const tarArgs = ['-czf', tgzPath, '.'];
    if (!includeDb) tarArgs.unshift('--exclude=*.db');
    await runCommand('tar', tarArgs, { cwd: tempDir, timeoutMs: GIT_TIMEOUT_MS });
    return { success: true, method: 'zip', download_path: tgzPath, warnings };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function proxyAction(action) {
  return async (req, res) => {
    const { name } = req.params;
    if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });

    try {
      const rr = await runnerRequest('POST', `/apps/${name}/${action}`);
      const data = await rr.json().catch(() => ({}));
      emit('apps', { action, name, status: rr.ok ? 'ok' : 'error' });
      res.status(rr.status).json(data || {});
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  };
}

router.get('/', async (req, res) => {
  try {
    const rr = await runnerRequest('GET', '/apps');
    const data = await rr.json().catch(() => null);
    if (data !== null) return res.status(rr.status).json(data);
    const text = await rr.text();
    res.status(rr.status).send(text);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { name, template, domain, project_id } = req.body || {};
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });
  if (!['basic', 'react'].includes(template)) return res.status(400).json({ error: 'Ungueltiges Template' });

  const appDir = path.resolve(APPS_DIR, name);
  if (fs.existsSync(appDir)) return res.status(409).json({ error: 'App existiert bereits' });

  const templateDir = path.resolve(APPS_DIR, '_templates', template);
  if (!fs.existsSync(templateDir)) return res.status(404).json({ error: 'Template nicht gefunden' });

  try {
    fs.mkdirSync(path.resolve(APPS_DIR), { recursive: true });
    fs.cpSync(templateDir, appDir, { recursive: true, errorOnExist: true, force: false });

    const appJsonPath = path.join(appDir, 'app.json');
    fs.writeFileSync(appJsonPath, JSON.stringify({
      name,
      domain: domain || null,
      autostart: false,
      env: {},
    }, null, 2) + '\n', 'utf-8');

    let runnerInfo = null;
    try {
      const details = await runnerRequest('GET', `/apps/${name}`);
      if (details.ok) runnerInfo = await details.json().catch(() => null);
    } catch (_) {}

    let caddyPending = false;
    if (domain) {
      const appPort = runnerInfo && (runnerInfo.port || runnerInfo.app?.port || runnerInfo.data?.port);
      if (appPort) {
        await registerCaddyRoute(domain, appPort);
        await syncCaddyTls([domain]);
      } else {
        caddyPending = true;
      }
    }

    const channelId = ensureAppChannel(project_id, name);

    emit('apps', { action: 'created', name, domain: domain || null, channel_id: channelId });
    res.status(201).json({ success: true, name, domain: domain || null, channel_id: channelId, caddy_pending: caddyPending });
  } catch (e) {
    if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const result = await importFromGithub(req.body || {}, { migrate: false });
    return res.status(201).json({
      success: true,
      name: result.name,
      domain: result.domain,
      channel_id: result.channel_id,
      warnings: result.warnings,
      source: 'github',
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Import fehlgeschlagen' });
  }
});

router.post('/import/migrate', async (req, res) => {
  try {
    const result = await importFromGithub(req.body || {}, { migrate: true, source: req.body?.source || 'github' });
    return res.status(201).json({
      success: true,
      name: result.name,
      domain: result.domain,
      channel_id: result.channel_id,
      warnings: result.warnings,
      source: 'github',
      report: result.report,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Import Analyse fehlgeschlagen' });
  }
});

router.get('/:name/tree', (req, res) => {
  const { name } = req.params;
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });
  const appDir = path.resolve(APPS_DIR, name);
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) return res.status(404).json({ error: 'App nicht gefunden' });

  try {
    const tree = buildTreeRecursive(appDir, appDir);
    res.json(tree);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  if (!isValidAppName(name) || !filePath) return res.status(400).json({ error: 'Ungueltige Anfrage' });

  const safe = safeAppPath(name, filePath);
  if (!safe) return res.status(400).json({ error: 'Ungueltiger Pfad' });
  if (!fs.existsSync(safe.full) || fs.statSync(safe.full).isDirectory()) return res.status(404).json({ error: 'Datei nicht gefunden' });

  try {
    const content = fs.readFileSync(safe.full, 'utf-8');
    res.json({ name: path.basename(safe.full), path: safe.rel, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  const { content } = req.body || {};

  if (!isValidAppName(name) || !filePath) return res.status(400).json({ error: 'Ungueltige Anfrage' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) erforderlich' });
  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE) return res.status(413).json({ error: 'Datei zu gross (max 1MB)' });

  const safe = safeAppPath(name, filePath);
  if (!safe) return res.status(400).json({ error: 'Ungueltiger Pfad' });

  try {
    fs.mkdirSync(path.dirname(safe.full), { recursive: true });
    fs.writeFileSync(safe.full, content, 'utf-8');
    res.json({ ok: true, path: safe.rel, size: Buffer.byteLength(content, 'utf-8') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:name/files/*', (req, res) => {
  const { name } = req.params;
  const folderPath = req.params[0];
  const { directory } = req.body || {};

  if (!isValidAppName(name) || !folderPath) return res.status(400).json({ error: 'Ungueltige Anfrage' });
  if (directory !== true) return res.status(400).json({ error: 'directory muss true sein' });

  const safe = safeAppPath(name, folderPath);
  if (!safe) return res.status(400).json({ error: 'Ungueltiger Pfad' });

  try {
    fs.mkdirSync(safe.full, { recursive: true });
    res.status(201).json({ ok: true, path: safe.rel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:name/files/*', (req, res) => {
  const { name } = req.params;
  const filePath = req.params[0];
  if (!isValidAppName(name) || !filePath) return res.status(400).json({ error: 'Ungueltige Anfrage' });

  const safe = safeAppPath(name, filePath);
  if (!safe) return res.status(400).json({ error: 'Ungueltiger Pfad' });
  if (!fs.existsSync(safe.full)) return res.status(404).json({ error: 'Pfad nicht gefunden' });

  try {
    fs.rmSync(safe.full, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:name/export', async (req, res) => {
  const { name } = req.params;
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });

  const includeDb = req.body?.include_db === true;
  const mode = req.body?.mode;
  if (mode && !['github', 'zip'].includes(mode)) return res.status(400).json({ error: 'Ungueltiger Export-Modus' });

  const appDir = path.resolve(APPS_DIR, name);
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) {
    return res.status(404).json({ error: 'App nicht gefunden' });
  }

  try {
    if (GITHUB_TOKEN && mode !== 'zip') {
      const result = await exportToGithub(name, appDir, includeDb);
      return res.json(result);
    }
    const result = await exportToArchive(name, appDir, includeDb);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Export fehlgeschlagen' });
  }
});

router.get('/:name/logs', async (req, res) => {
  const { name } = req.params;
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });

  const url = new URL(`/apps/${name}/logs`, APP_RUNNER_URL);
  const headers = {};
  if (APP_RUNNER_KEY) headers['x-api-key'] = APP_RUNNER_KEY;

  const upstream = http.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: 'GET',
    headers,
  }, upstreamRes => {
    const status = upstreamRes.statusCode || 500;
    if (status < 200 || status >= 300) {
      let data = '';
      upstreamRes.on('data', chunk => data += chunk);
      upstreamRes.on('end', () => {
        res.status(status).send(data || 'Runner Logstream Fehler');
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    upstreamRes.pipe(res, { end: true });
    req.on('close', () => upstream.destroy());
  });

  upstream.on('error', err => {
    if (!res.headersSent) res.status(502).json({ error: err.message });
    else res.end();
  });

  upstream.end();
});

router.post('/:name/start', proxyAction('start'));
router.post('/:name/stop', proxyAction('stop'));
router.post('/:name/restart', proxyAction('restart'));
router.post('/:name/install', proxyAction('install'));

router.get('/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });

  try {
    const rr = await runnerRequest('GET', `/apps/${name}`);
    const data = await rr.json().catch(() => null);
    if (data !== null) return res.status(rr.status).json(data);
    const text = await rr.text();
    res.status(rr.status).send(text);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.delete('/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidAppName(name)) return res.status(400).json({ error: 'Ungueltiger App-Name' });

  const appDir = path.resolve(APPS_DIR, name);
  if (!fs.existsSync(appDir)) return res.status(404).json({ error: 'App nicht gefunden' });

  try {
    let domain = null;
    const appJsonPath = path.join(appDir, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      try {
        const appMeta = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
        domain = appMeta.domain || null;
      } catch (_) {}
    }

    try {
      await runnerRequest('POST', `/apps/${name}/stop`);
    } catch (_) {}

    if (domain) await removeCaddyRoute(domain);

    fs.rmSync(appDir, { recursive: true, force: true });
    deleteAppChannel(name);

    emit('apps', { action: 'deleted', name });
    res.json({ success: true, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
