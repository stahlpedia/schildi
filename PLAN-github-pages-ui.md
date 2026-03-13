# Plan: GitHub Import für statische Pages im Dashboard

Ziel: Pro Session genau ein kleiner, abschließbarer Schritt. Keine Mischsessions.

## Bereits erledigt

### Schritt 1
Admin Bereich für GitHub Token
- Integrationen Sektion im Admin angelegt
- GitHub Token speichern
- GitHub Token Status anzeigen
- Gespeicherten GitHub Token löschen
- Frontend Build erfolgreich
- Backend für Token Verwaltung erfolgreich geladen

### Schritt 2
Pages Backend für GitHub Import und Sync
- Endpoint für GitHub Import vorhanden
- Endpoint für Sync vorhanden
- Quelle pro Site wird gespeichert
- Import gegen öffentliches Repo getestet
- Sync Fehler mit `default` Ref gefunden und behoben
- Sync danach erfolgreich getestet

## Offene Schritte

### Schritt 3
Pages UI: Nur Import Button im Header
Ziel:
- Im Pages Header erscheint ein Button "GitHub Import"
- Noch kein Modal, noch keine Logik
- Reiner UI Platzhalter, damit die Struktur steht

Abnahme:
- Button sichtbar
- Build grün

### Schritt 4
Pages UI: GitHub Import Modal
Ziel:
- Klick auf Button öffnet Modal
- Felder: owner, repo, branch/ref optional, Unterordner optional, clean ja/nein
- Noch kein API Call

Abnahme:
- Modal öffnet und schließt sauber
- Felder sind editierbar
- Build grün

### Schritt 5
Pages UI: Import API anbinden
Ziel:
- Modal sendet Daten an vorhandenen Import Endpoint
- Erfolgsmeldung anzeigen
- Dateibaum nach Import neu laden

Abnahme:
- Echter Import aus Repo über UI möglich
- Files erscheinen danach in der Site
- Build grün

### Schritt 6
Pages UI: Source Status anzeigen
Ziel:
- Für gewählte Site anzeigen, ob GitHub Quelle hinterlegt ist
- Anzeigen: owner/repo, ref, subpath

Abnahme:
- Sichtbarer Source Block im Pages Bereich
- Daten kommen aus source Endpoint
- Build grün

### Schritt 7
Pages UI: Sync Button
Ziel:
- Wenn Quelle vorhanden ist, Button "Sync" anzeigen
- Klick triggert vorhandenen Sync Endpoint
- Danach Reload des Dateibaums

Abnahme:
- Sync über UI funktioniert
- Dateibaum aktualisiert sich
- Build grün

### Schritt 8
Feinschliff
Ziel:
- Ladezustände
- Fehlertexte verständlich
- Kleine Erfolgshinweise
- Optional: Confirm bei clean Import

Abnahme:
- UI wirkt rund und robust
- Build grün

## Session-Regel für die nächsten Sessions
- Immer genau einen Schritt auswählen
- Vor dem Coden kurz sagen: "Ich mache nur Schritt X"
- Nach dem Coden sofort Build oder gezielten Test
- Danach sofort Ergebnis melden
- Kein zusätzlicher Umbau außerhalb des Schritts

## Empfohlene nächste Session
Schritt 3: Nur GitHub Import Button im Pages Header
