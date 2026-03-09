# React Template

Ein Startgeruest mit Express, SQLite, Cookie Session Auth und React Frontend.

## Start

1. `npm install`
2. `npm run build`
3. `npm run start`
4. Browser auf `http://localhost:3000`

## Development

1. `npm install`
2. `npm run build`
3. `npm run dev`

## API

1. `GET /api/health`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. `GET /api/auth/me`
6. `GET /api/protected`

## Hinweise

1. `npm run build` erstellt `public/index.html` und `public/assets/app.js`.
2. Cookie ist `httpOnly`, `sameSite=lax` und in Production auch `secure`.
3. Passwort wird mit bcrypt gehasht.
