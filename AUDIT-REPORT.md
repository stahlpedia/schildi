# 🔍 Schildi Dashboard Code-Audit Bericht

**Datum:** 02.03.2026  
**Auditor:** Schildi (KI-Agent)  
**Scope:** Vollständige Code-Review des Schildi Dashboard Projekts

## Zusammenfassung

Das Schildi Dashboard weist mehrere **kritische Sicherheitslücken** auf, die sofortigen Handlungsbedarf erfordern. Besonders bedenklich sind die Puppeteer XSS-Vektoren, fehlende Input-Validierung und unsichere File-Upload-Mechanismen.

**Kritische Findings:** 8  
**Mittlere Findings:** 15  
**Niedrige Findings:** 12  

---

## 🔴 Kritische Sicherheitslücken (Sofortiger Fix erforderlich)

### K01: XSS via Puppeteer Template Rendering
**Dateien:** `server/lib/renderer.js:51-65`, `server/routes/social.js:250-280`  
**Beschreibung:** User-Input (HTML/CSS) wird ohne Sanitization direkt in Puppeteer ausgeführt. Beliebiger JavaScript-Code kann injiziert werden.  
**Beispiel:** `<img src=x onerror="fetch('/admin/secrets')">`  
**Empfehlung:** HTML-Sanitization mit Bibliothek wie DOMPurify implementieren, CSP Headers setzen

### K02: Puppeteer ohne Sandbox
**Datei:** `server/lib/renderer.js:17`  
**Beschreibung:** `--no-sandbox` Flag ermöglicht Code-Execution auf Host-Level  
**Empfehlung:** Sandbox entfernen, Puppeteer in Docker-Container isolieren, User-Namespaces nutzen

### K03: Command Injection in ffmpeg
**Datei:** `server/lib/video-renderer.js:85-120`  
**Beschreibung:** User-Input wird direkt in ffmpeg Kommandos eingebettet ohne Validation  
**Beispiel:** `; rm -rf /; #` in Dateinamen  
**Empfehlung:** Parameterized Commands verwenden, Input-Validation, Whitelist für erlaubte Zeichen

### K04: Path Traversal in File Operations
**Dateien:** `server/routes/pages.js:45-50`, `server/routes/media.js:110-120`  
**Beschreibung:** `safePath()` kann mit speziellen Pfaden umgangen werden  
**Beispiel:** `../../../etc/passwd` via URL-Encoding oder Symlinks  
**Empfehlung:** Robuste Path-Validation, Canonical Path Checks, Chroot-ähnliche Isolation

### K05: Unrestricted File Uploads
**Dateien:** `server/routes/media.js:25-30`, `server/routes/attachments.js:25-30`  
**Beschreibung:** Alle Dateitypen erlaubt, 50MB Limit, keine Virus-Checks  
**Empfehlung:** MIME-Type Whitelist, File-Content Validation, Virus-Scanner Integration, niedrigere Limits

### K06: SQL Schema ohne Foreign Keys während Migration
**Datei:** `server/db.js:15`  
**Beschreibung:** FK-Constraints sind während Migration deaktiviert, Datenintegrität gefährdet  
**Empfehlung:** FK-Checks nur temporär für einzelne Statements deaktivieren, nicht global

### K07: Weak JWT Secret
**Datei:** `server/auth.js:6`  
**Beschreibung:** Fallback auf `dev-secret-change-me` wenn ENV nicht gesetzt  
**Empfehlung:** Starken Random-Secret generieren, Application-Start verhindern wenn nicht gesetzt

### K08: CORS komplett offen
**Datei:** `server/index.js:12`  
**Beschreibung:** `app.use(cors())` erlaubt alle Origins  
**Empfehlung:** Spezifische Origins konfigurieren, Credentials-Handling definieren

---

## 🟡 Mittlere Sicherheitsrisiken

### M01: Media Files ohne Authentication
**Datei:** `server/index.js:18-35`  
**Beschreibung:** `/api/media/file/:id` Endpoint ist öffentlich zugänglich  
**Empfehlung:** Token-basierte URL-Signatur oder Session-basierte Zugriffskontrolle

### M02: Fehlende Rate Limiting
**Dateien:** `server/auth.js`, alle API-Routes  
**Beschreibung:** Keine Brute-Force Protection für Login, API-Missbrauch möglich  
**Empfehlung:** express-rate-limit implementieren, Failed-Login Tracking

### M03: Error Information Disclosure
**Datei:** `client/src/api.js:22`  
**Beschreibung:** Server-Fehlermeldungen werden ungefiltert an Client weitergegeben  
**Empfehlung:** Generic Error-Messages für Client, detaillierte Logs nur server-seitig

### M04: SSRF via Audio URL Download
**Datei:** `server/lib/video-renderer.js:75-80`  
**Beschreibung:** `options.audio_url` wird ohne URL-Validation heruntergeladen  
**Empfehlung:** URL-Whitelist, lokale/private IP-Ranges blocken

### M05: Fehlende Input-Validierung in Templates
**Dateien:** `server/routes/social.js:150-200`  
**Beschreibung:** Template-Felder werden ohne Schema-Validation gespeichert  
**Empfehlung:** JSON-Schema Validation, Field-Type Checks

### M06: Unvalidated JSON Parsing
**Dateien:** Multiple files mit `JSON.parse()` ohne try/catch  
**Beschreibung:** App-Crashes bei malformed JSON Input möglich  
**Empfehlung:** Safe JSON parsing mit Validation

### M07: Bcrypt Rounds nicht konfigurierbar
**Dateien:** `server/auth.js:14`, `server/routes/pages.js:180`  
**Beschreibung:** Hardcoded 10 Rounds könnten zu schwach werden  
**Empfehlung:** Konfigurierbare Rounds, mindestens 12-15

### M08: Token in localStorage (XSS-anfällig)
**Datei:** `client/src/api.js:10-15`  
**Beschreibung:** JWT in localStorage anfällig für XSS-Attacks  
**Empfehlung:** HttpOnly Cookies mit SameSite=Strict verwenden

### M09: Automatic Window Reload bei 401
**Datei:** `client/src/api.js:19`  
**Beschreibung:** `window.location.reload()` kann störend sein und State verlieren  
**Empfehlung:** Graceful Re-Login Flow ohne Page-Reload

### M10: Fehlende CSRF Protection
**Dateien:** Alle POST/PUT/DELETE Endpoints  
**Beschreibung:** State-changing Operations ohne CSRF-Token  
**Empfehlung:** CSRF-Token in Forms, SameSite Cookies

### M11: File Content ohne Content-Type Validation
**Datei:** `server/index.js:50-65`  
**Beschreibung:** Text-Files werden basierend auf Extension, nicht Content validiert  
**Empfehlung:** Magic Number/Content-Type Detection

### M12: Resource Exhaustion via ffmpeg
**Datei:** `server/lib/video-renderer.js:100-110`  
**Beschreibung:** 300s Timeout, 50MB Buffer können DoS verursachen  
**Empfehlung:** Niedrigere Limits, Job-Queue mit Rate-Limiting

### M13: Database Migration ohne Transaktionen
**Datei:** `server/db.js:50-400`  
**Beschreibung:** Komplexe Schema-Änderungen ohne Rollback-Möglichkeit  
**Empfehlung:** Transaction-wrapped Migrations, Rollback-Scripts

### M14: Password Update bei jedem App-Start
**Datei:** `server/auth.js:10-18`  
**Beschreibung:** Admin-Passwort wird bei jedem Start überschrieben  
**Empfehlung:** Nur bei Erstinstallation oder explizit gewünschter Änderung

### M15: Unlimited Reconnection ohne Backoff
**Datei:** `client/src/useSSE.js:25-35`  
**Beschreibung:** SSE-Reconnects alle 3s können Server überlasten  
**Empfehlung:** Exponential Backoff, Maximum Retry Count

---

## 🟢 Niedrige Risiken und Code-Qualitätsprobleme

### L01: Unused Imports und Dead Code
**Dateien:** Various  
**Beschreibung:** Mehrere unused imports, deprecated endpoints  
**Empfehlung:** ESLint mit unused-imports Plugin, Code-Cleanup

### L02: Inkonsistente Error-Handling Patterns
**Dateien:** Route-Files  
**Beschreibung:** Mix aus res.status().json() und throw new Error()  
**Empfehlung:** Einheitliches Error-Handling Middleware

### L03: Memory Leak potentiale
**Datei:** `server/lib/renderer.js:12-20`  
**Beschreibung:** Shared Browser Instance ohne proper Cleanup  
**Empfehlung:** Browser-Pool mit Lifecycle-Management

### L04: Fehlende Loading/Error States
**Datei:** `client/src/App.jsx`  
**Beschreibung:** UI zeigt keine Loading-Indikatoren bei API-Calls  
**Empfehlung:** Loading-States und Error-Boundaries implementieren

### L05: Race Conditions bei File Operations
**Dateien:** Media/Attachments Routes  
**Beschreibung:** Async File-Operations ohne proper Locking  
**Empfehlung:** File-Locking, Atomic Operations

### L06: Hardcoded Paths und URLs
**Dateien:** Various  
**Beschreibung:** Hardcoded `/tmp`, Media-Pfade nicht konfigurierbar  
**Empfehlung:** Environment-basierte Konfiguration

### L07: Fehlende Accessibility
**Datei:** `client/src/App.jsx`  
**Beschreibung:** Keine ARIA-Labels, Keyboard-Navigation unvollständig  
**Empfehlung:** WCAG-Guidelines befolgen, axe-core Testing

### L08: Missing Input Sanitization
**Dateien:** Frontend Components  
**Beschreibung:** User-Input wird teilweise ungefiltert in DOM eingesetzt  
**Empfehlung:** DOMPurify für HTML-Content, Input-Validation

### L09: N+1 Query Patterns
**Datei:** `server/routes/social.js:110-130`  
**Beschreibung:** Nested Queries in Loops können Performance beeinträchtigen  
**Empfehlung:** SQL-Joins, Query-Optimierung

### L10: Fehlende DB-Indizes
**Datei:** `server/db.js`  
**Beschreibung:** Häufig abgefragte Columns ohne Index  
**Empfehlung:** Performance-kritische Queries analysieren, Indizes hinzufügen

### L11: Large Payload ohne Pagination
**Dateien:** List-Endpoints  
**Beschreibung:** Unbegrenzte Result-Sets können Browser überlasten  
**Empfehlung:** Pagination, Limit-Parameter

### L12: Frontend Re-Render Issues
**Datei:** `client/src/App.jsx:45-80`  
**Beschreibung:** Viele inline Event-Handler verursachen unnötige Re-Renders  
**Empfehlung:** useCallback/useMemo optimierung

---

## 📊 Prioritäten-Matrix

### Sofortige Maßnahmen (diese Woche):
1. **K02**: Puppeteer Sandbox aktivieren
2. **K07**: JWT Secret Configuration
3. **K08**: CORS Configuration
4. **K05**: File Upload Restrictions

### Kurzfristig (nächste 2 Wochen):
1. **K01**: XSS-Sanitization implementieren
2. **K03**: ffmpeg Input-Validation
3. **K04**: Path Traversal Prevention
4. **M01**: Media File Authentication

### Mittelfristig (nächster Monat):
1. **M02**: Rate Limiting
2. **M08**: Cookie-based Authentication
3. **M13**: Migration Transaktionen
4. Alle weiteren Medium-Risiken

### Langfristig (nächste 3 Monate):
1. Code-Qualität Verbesserungen
2. Performance Optimierungen
3. Accessibility Compliance
4. Comprehensive Testing

---

## 🛡️ Empfohlene Sicherheitsmaßnahmen

### 1. Security Headers
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}))
```

### 2. Input Validation Framework
```javascript
const Joi = require('joi')
const validateInput = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body)
  if (error) return res.status(400).json({ error: error.details[0].message })
  next()
}
```

### 3. File Upload Security
```javascript
const upload = multer({
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'text/plain']
    cb(null, allowedTypes.includes(file.mimetype))
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
})
```

---

## 📝 Fazit

Das Schildi Dashboard hat eine solide Funktionalität, weist aber **erhebliche Sicherheitslücken** auf. Die kritischen XSS und Command Injection Vektoren müssen **sofort** behoben werden, bevor das System in produktiver Umgebung eingesetzt werden kann.

Die größten Risiken entstehen durch:
- Fehlende Input-Sanitization
- Unsichere Puppeteer/ffmpeg Integration  
- Schwache Authentication-Mechanismen
- Unzureichende File-Upload Controls

Nach Umsetzung der empfohlenen Fixes würde das System ein akzeptables Sicherheitsniveau für interne Nutzung erreichen.

**Status:** ⚠️ Produktive Nutzung nicht empfohlen bis kritische Fixes implementiert sind.