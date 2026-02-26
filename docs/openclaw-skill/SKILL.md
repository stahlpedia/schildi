---
name: schildi-dashboard
description: Interagiere mit dem Schildi Dashboard (Kanban, Content/Mediathek, Social Media, Channels, Pages, Admin). Nutze diesen Skill wenn du Dashboard-APIs aufrufst, Tasks verwaltest, Dateien hochlädst, Content renderst oder Websites verwaltest.
---

# Skill: Schildi Dashboard

Dashboard für KI-Agenten mit Kanban, Content-Management, Social Media, Channels und Website-Verwaltung.

## Verbindung

- **Host:** `schildi-dashboard:3333` (Docker-intern)
- **Login:** `POST /api/login` mit `{"username":"...","password":"..."}` → `{"token":"...", "username":"..."}`
- **Auth:** `Authorization: Bearer <token>` bei allen weiteren Requests
- **Passwort:** Über Umgebungsvariable (z.B. `$KANBAN_PW`)

## Projekt-System

Alles ist projekt-scoped. Ein Projekt hat ein eigenes Board, Channels, Content-Ordner, Social Media und Pages.

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects` | GET | Alle Projekte |
| `/api/projects` | POST | Neues Projekt `{"name":"..."}` |
| `/api/projects/:id` | PUT | Projekt umbenennen |
| `/api/projects/:id` | DELETE | Projekt löschen |

Neues Projekt erstellt automatisch: Default-Board ("General"), Context-Ordner ("Generiert", "Persönlicher Stock"), Chat-Channel ("Schildi").

## Kanban

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/kanban/tasks` | GET | Alle Tasks (optional `?project_id=X`) |
| `/api/kanban/tasks` | POST | Task erstellen |
| `/api/kanban/cards/:id` | PUT | Task verschieben/bearbeiten |
| `/api/kanban/cards/:id` | DELETE | Task löschen (**nur Mensch!**) |

### Task erstellen
```json
{"title":"...", "description":"...", "status":"backlog", "labels":["bug","feature"], "project_id": 1}
```

### Task verschieben
```json
{"column_name":"backlog|in-progress|done", "position":1}
```

### Workflow-Regeln
- Bugs vor Features abarbeiten
- KI darf Tasks erstellen, verschieben, bearbeiten
- KI darf Tasks **nicht löschen** (nur der Mensch)

## Content / Mediathek (projekt-scoped)

### Content-Channels
Ordner können einem Channel zugeordnet werden.

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/context/content-channels` | GET/POST | Channels auflisten/erstellen |
| `/api/projects/:pid/context/content-channels/:id` | PUT/DELETE | Channel bearbeiten/löschen |

### Ordner

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/context/folders` | GET | Ordner auflisten (optional `?category=content&channel_id=X`) |
| `/api/projects/:pid/context/folders` | POST | Ordner erstellen `{"name":"...", "category":"content", "channel_id": X}` |
| `/api/projects/:pid/context/folders/:id` | PUT | Ordner umbenennen |
| `/api/projects/:pid/context/folders/:id` | DELETE | Ordner löschen (`?confirm=true` wenn Dateien drin) |

System-Ordner ("Generiert", "Persönlicher Stock") können nicht gelöscht werden.

### Dateien

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/context/files` | GET | Dateien auflisten (`?folder_id=X&search=Y&tag=Z`) |
| `/api/projects/:pid/context/upload` | POST | Datei hochladen (multipart: `file`, `folderId` oder `folder_id`, `tags`) |
| `/api/projects/:pid/context/files/:id` | PUT | Metadaten bearbeiten `{"tags":[], "alt_text":"..."}` |
| `/api/projects/:pid/context/files/:id` | DELETE | Datei löschen |

### Datei-Inhalt (Textdateien)

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/media/files/:id/content` | GET | Textinhalt lesen (.md, .txt, .json, .yml, .css, .html, .js etc.) |
| `/api/media/files/:id/content` | PUT | Textinhalt schreiben `{"content":"..."}` |
| `/api/media/files/:id/serve` | GET | Datei ausliefern (kein Auth nötig, für img src) |
| `/api/media/file/:id` | GET | Alias für serve |

**Physischer Speicher:** `/media/<folder_id>/<fileId>_<filename>`

## Social Media (projekt-scoped)

### Content-Profil
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/social/profile` | GET/PUT | Profil lesen/aktualisieren |

### Templates
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/social/templates` | GET/POST | Templates auflisten/erstellen |
| `/api/projects/:pid/social/templates/:id` | GET/PUT/DELETE | Template CRUD |

### PNG-Rendering (Puppeteer)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/social/render` | POST | PNG rendern (Response: image/png) |
| `/api/projects/:pid/social/render/preview` | POST | Vorschau rendern |
| `/api/projects/:pid/social/render/save` | POST | Rendern und in Mediathek speichern |

### Video-Rendering (Puppeteer + ffmpeg)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/social/render/video` | POST | MP4 rendern |
| `/api/projects/:pid/social/render/video/save` | POST | Rendern und in Mediathek speichern |

Video-Body:
```json
{
  "slides": [{"template":"...", "data":{}, "duration":5000}],
  "audio_url": "https://...",
  "width": 1080, "height": 1920, "fps": 30,
  "transition": "fade"
}
```

Slides können auch `{"html":"...", "css":"...", "duration":5000}` sein.
Timeout: 300s, max 50MB.

## Channels (Dashboard → OpenClaw)

Das Dashboard kann direkt mit OpenClaw chatten:
- **URL:** `${OPENCLAW_URL}/v1/chat/completions`
- **Auth:** `Bearer ${OPENCLAW_TOKEN}`
- **Session:** `user: schildi-dashboard-convo-{id}`

Channels werden im Dashboard unter "Channels" verwaltet. Jeder Channel hat eine eigene Conversation mit vollem Agent-Zugriff.

## Pages (AI-Websites)

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/projects/:pid/pages/domains` | GET/POST | Domains auflisten/erstellen |
| `/api/projects/:pid/pages/domains/:domain` | DELETE | Domain löschen |
| `/api/projects/:pid/pages/domains/:domain/files` | GET | Dateien einer Domain |
| `/api/projects/:pid/pages/domains/:domain/files/:path` | GET/PUT | Datei lesen/schreiben `{"content":"..."}` |

### Caddy-Integration
- Dashboard registriert Routen bei Caddy via Admin-API (`http://caddy:2019`)
- Physischer Pfad: `/var/www/ai-websites/<domain>/` (Host) → `/websites/<domain>/` (Dashboard) → `/srv/websites/<domain>/` (Caddy)
- TLS wird automatisch registriert (ACME + ZeroSSL)
- **Nach Caddy-Restart:** Dashboard auch neustarten (Routen gehen verloren)

## Admin

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/admin/backup` | GET | Datenbank-Backup herunterladen |
| `/api/admin/restore` | POST | Datenbank-Backup einspielen |
| `/api/admin/system` | GET | System-Info |

## Wichtige Learnings

- **SQLite:** `ALTER TABLE DEFAULT` kann kein `datetime('now')`, nur Konstanten
- **Docker Volumes:** `copyFileSync` statt `renameSync` (cross-device)
- **Puppeteer:** `headless: 'new'`, `--no-sandbox` nötig im Container
- **img src Endpoints:** MÜSSEN vor Auth-Middleware stehen (Browser sendet keinen Token)
- **Dockerfile:** `node:22-slim` (nicht Alpine, wegen glibc-Abhängigkeiten)
- **Upload `folderId`:** Akzeptiert sowohl `folderId` (camelCase) als auch `folder_id` (snake_case)

## Skill teilen

Diesen Skill in andere OpenClaw-Instanzen bringen:

1. **Per Chat:** Dateiinhalt im Slack/Chat senden, KI speichert als `skills/schildi-dashboard/SKILL.md`
2. **Per Git:** Skill-Ordner ins Repo pushen, auf anderem OpenClaw clonen
3. **Per Download:** Datei auf den Server kopieren nach `workspace/skills/schildi-dashboard/SKILL.md`

Die KI erkennt den Skill automatisch, wenn er in `skills/*/SKILL.md` liegt und eine passende Beschreibung hat.
