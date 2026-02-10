# 🐢 Schildi Dashboard

Dashboard für die Zusammenarbeit zwischen Thomas (Mensch) und Schildi (KI).

## Features

- **Kanban Board** — Backlog → In Progress → Done mit Drag & Drop
- **Memory Viewer** — Zeigt Workspace-Dateien (MEMORY.md, SOUL.md etc.) als Markdown
- **Logbuch** — Chronologische Aktivitäten mit Kategorien
- **Login** — Passwort-Auth mit JWT

## Setup

```bash
cp .env.example .env
# .env bearbeiten
npm run setup
npm start
```

Dashboard läuft auf `http://localhost:3333`

## Docker

```bash
cp .env.example .env
docker compose -f docker-compose.example.yml up -d
```

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `PORT` | 3333 | Server-Port |
| `DASHBOARD_PASSWORD` | changeme | Login-Passwort |
| `JWT_SECRET` | dev-secret | JWT Signatur-Key |
| `WORKSPACE_PATH` | /home/node/.openclaw/workspace | Pfad für Memory Viewer |

## Tech Stack

Express.js · React · Vite · SQLite · Tailwind CSS · JWT
