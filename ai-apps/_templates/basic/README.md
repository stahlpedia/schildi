# Basic Template

Ein solides Startgeruest mit Express, SQLite und Cookie Session Auth.

## Start

1. `npm install`
2. `npm run start`
3. Browser auf `http://localhost:3000`

## API

1. `GET /api/health`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. `GET /api/auth/me`
6. `GET /api/protected`

## Hinweise

1. Cookie ist `httpOnly`, `sameSite=lax` und in Production auch `secure`.
2. Passwort wird mit bcrypt gehasht.
3. Session Token wird als SHA256 Hash in der Datenbank gespeichert.
