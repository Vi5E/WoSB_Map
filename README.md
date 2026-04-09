# WoSB Map

Inoffizielle interaktive Karte fuer World of Sea Battle.

## Inhalt

Diese GitHub-Pages-Version enthaelt nur die Dateien, die fuer die Website noetig sind:

- `index.html`
- `app.js`
- `data.js`
- `style.css`
- Ordner `assets`
- Ordner `vendor`
- Datei `.nojekyll`

## Website auf GitHub Pages veroeffentlichen

### 1. Repository auf GitHub erstellen

Beim Erstellen des Repositories:

- `Repository name`: `WoSB_Map`
- `Description`: `Unofficial interactive map for World of Sea Battle`
- `Visibility`: `Public`
- `Add README`: `Off`
- `Add .gitignore`: `No .gitignore`
- `Add license`: `No license`

Dann auf `Create repository` klicken.

### 2. Diese Dateien hochladen

Oeffne den Ordner dieser GitHub-Pages-Version und lade nur dessen Inhalt hoch:

- `index.html`
- `app.js`
- `data.js`
- `style.css`
- `assets`
- `vendor`
- `.nojekyll`
- `README.md`

Wichtig:

- Nicht den uebergeordneten Projektordner hochladen
- Keine Backups, ZIP-Dateien, `_restore`-Ordner oder Temp-Dateien hochladen
- Die `index.html` muss im Repository direkt im Hauptordner liegen

### 3. Dateien im Repository hochladen

Nach dem Erstellen des Repositories:

1. Im neuen Repository auf `uploading an existing file` klicken
2. Den kompletten Inhalt dieses Ordners in das Browserfenster ziehen
3. Unten eine Commit-Nachricht eingeben, zum Beispiel:
   `Initial GitHub Pages upload`
4. Auf `Commit changes` klicken

### 4. GitHub Pages einschalten

Im Repository:

1. Auf `Settings` gehen
2. Links `Pages` auswaehlen
3. Bei `Build and deployment` folgendes einstellen:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - Ordner: `/ (root)`
4. Auf `Save` klicken

Danach baut GitHub die Seite automatisch.

### 5. Website aufrufen

Die Seite ist danach normalerweise unter dieser Adresse erreichbar:

`https://vi5e.github.io/WoSB_Map/`

Falls sie nicht sofort sichtbar ist:

- 1 bis 5 Minuten warten
- die Seite neu laden
- in `Settings > Pages` pruefen, ob die Deployment-URL angezeigt wird

## Was die Website kann

- Interaktive Karte anzeigen
- Sprachumschaltung Deutsch/Englisch
- Eigene Marker im Browser speichern
- Layer ein- und ausblenden
- Entfernungen messen
- Impressum/Fanprojekt-Hinweis anzeigen

## Wichtige Hinweise

### Browser-Speicher

Eigene Marker und einige Einstellungen werden nur lokal im Browser gespeichert.

Das bedeutet:

- sichtbar nur auf dem Geraet und im Browser, in dem du sie erstellt hast
- nicht automatisch mit GitHub synchronisiert
- nicht automatisch fuer andere Besucher sichtbar

### Fanprojekt-Hinweis

Diese Seite ist ein inoffizielles Fanprojekt. Rechte an World of Sea Battle und zugehoerigen Inhalten liegen bei den jeweiligen Rechteinhabern.

### Rechtlicher Hinweis

Der auf der Seite eingebaute Hinweis ist ein Fanprojekt-Disclaimer. Wenn du die Seite aus Deutschland oeffentlich betreibst, kann trotzdem ein vollstaendiges Impressum mit echten Anbieterangaben erforderlich sein.

## Dateien spaeter aktualisieren

Wenn du spaeter etwas aendern willst:

1. Die geaenderten Dateien lokal anpassen
2. Im GitHub-Repository `Add file` > `Upload files` waehlen
3. Alte Dateien durch neue ersetzen
4. Commit erstellen

GitHub Pages aktualisiert die Seite danach automatisch.
