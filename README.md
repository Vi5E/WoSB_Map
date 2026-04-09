# WoSB Map — Interaktive Karte für World of Sea Battle

Inoffizielle, interaktive Karte für das MMO **World of Sea Battle** (Thera Interactive).  
Funktioniert komplett im Browser — keine Installation, kein Login, kein Server nötig.

---

## Was ist das?

Eine vollständige Übersichtskarte der Spielwelt mit allen bekannten Häfen, Leuchttürmen, persönlichen Inseln, Produktionsstätten, Altären, Festungen und Schnellreiserouten. Die Karte dient als Nachschlagewerk, Planungstool und persönliches Tracking-System für deine Spielressourcen.

---

## Features

### 🗺️ Kartenebenen

Die Karte zeigt verschiedene Ebenen, die einzeln ein- und ausgeblendet werden können:

- **Häfen** — alle 42 Häfen mit Typ (normal, klein, befestigt, Piratenhafen), Region und Position
- **Leuchttürme** — 111 Leuchttürme als Orientierungspunkte
- **Schnellreiserouten** — animierte Verbindungslinien zwischen Häfen
- **Persönliche Inseln** — 66 bekannte Insel-Positionen
- **Produktionsstätten** — Kohle, Kupfer, Eisen, Holz, Harz, Rum, Wasser, Farmen
- **Altäre** — 5 bekannte Altar-Positionen
- **Festungen** — 28 Festungs-Positionen
- **PVP-Kreisgrenze** — visuelle Grenze der PVP-Zone
- **Freie Marker** — eigene Marker per Rechtsklick setzen

### 🏝️ Persönliches Tracking

Du kannst deine eigenen Spielressourcen auf der Karte markieren und verwalten:

#### Persönliche Inseln
- Insel als „meine" markieren und benennen
- **Werkstatt wählen** per Chip-Auswahl: Balkenwerkstatt, Weberei, Bronzeschmelze, Plattenwerkstatt, Schottwerkstatt, Proviantproduktion
- **Produktion wählen** per Chip-Auswahl: Bier, Getreide, Vorräte, Zucker
- Automatische Region- und nächster-Hafen-Erkennung
- 7nm-Radius-Kreis zur Visualisierung der Minenreichweite

#### Häfen
- **Lager** setzen/entfernen (Warehouse-Tracking)
- **Werkstätten wählen** per Chip-Auswahl (max. 2 pro Hafen): Balken, Bronze, Platte, Segeltuch, Schott, Gießerei

#### Produktionsstätten & Druckereien
- Minen, Farmen und Druckereien als „meine" markieren
- Maximale Anzahl wird automatisch begrenzt

### 📏 Entfernungsmessung

- **Strg gedrückt halten** und auf die Karte klicken, um Messpunkte zu setzen
- Entfernungen werden in Seemeilen (nm) angezeigt
- Messpunkte rasten an Häfen, Inseln und Produktionsstätten ein (Snapping)
- Gespeicherte Routen als eigene Kartenebene

### 🔍 Suche

- Häfen, Inseln und Ressourcen durchsuchen
- Unterstützt deutsche und englische Namen
- Aliase für häufige Tippfehler (z.B. „Los Catuona" → Los Catuano)
- Ergebnisse nach Typ kategorisiert (Hafen, Insel, Ressource, Altar, Festung)

### 💾 Export / Import

- **Marker exportieren** — speichert ALLE persönlichen Daten als `.json`-Datei:
  - Freie Marker, persönliche Inseln, Minen, Druckereien
  - Hafen-Einstellungen (Lager, Werkstätten)
  - Gespeicherte Routen
- **Marker importieren** — stellt alle Daten aus einer Export-Datei wieder her
- Rückwärtskompatibel mit älteren Export-Dateien

### 🌙 Dark Mode

- Umschaltbar über den Button unten rechts
- Dunkles Kartendesign mit angepassten Farben

### 🌐 Zweisprachig

- Deutsch und Englisch umschaltbar
- Alle UI-Texte, Hafennamen und Tooltips in beiden Sprachen

### 📱 Responsive

- Funktioniert auf Desktop und Mobilgeräten
- Sidebar auf Mobilgeräten ein-/ausklappbar
- Touch-Gesten für Zoom und Pan

---

## Bedienung

| Aktion | Eingabe |
|--------|---------|
| Karte bewegen | Linke Maustaste ziehen |
| Zoomen | Mausrad oder +/- Buttons |
| Popup öffnen | Hafen, Insel oder POI anklicken |
| Marker setzen | Rechtsklick auf die Karte |
| Koordinaten kopieren | Rechtsklick → „Koordinaten kopieren" |
| Entfernung messen | Strg + Klick |
| Dark Mode | Button unten rechts (☀/🌙) |
| Sprache wechseln | DE / EN Buttons oben links |

---

## Meine Standorte (Sidebar)

Im Bereich „Meine Standorte" werden alle markierten Elemente übersichtlich aufgelistet:

- **Persönliche Inseln** — mit Name, Werkstatt und Produktion
- **Häfen** — mit Werkstätten und Lagerstatus
- **Produktionsstätten** — markierte Minen und Farmen
- **Freie Marker** — selbst gesetzte Marker

Die Liste ist nach Typ filterbar und zeigt die Koordinaten jedes Eintrags. Ein Klick auf einen Eintrag zentriert die Karte auf den entsprechenden Punkt.

---

## Datenspeicherung

Alle persönlichen Daten (Marker, Inseln, Hafen-Einstellungen, Routen) werden **ausschließlich lokal im Browser** gespeichert (`localStorage`). Es werden keine Daten an einen Server gesendet.

Das bedeutet:
- Deine Daten sind nur in dem Browser verfügbar, in dem du sie erstellt hast
- Ein Browserwechsel oder das Löschen der Browserdaten löscht deine Markierungen
- Nutze die **Export-Funktion**, um deine Daten zu sichern und auf andere Geräte zu übertragen

---

## Rechtlicher Hinweis

Diese Website ist ein **inoffizielles Fanprojekt**.  
Alle Rechte an World of Sea Battle und allen zugehörigen Namen, Logos, Grafiken, Marken und Spielinhalten liegen bei den jeweiligen Rechtsinhabern, insbesondere bei **Thera Interactive** als Entwickler und Publisher.  
Dieses Projekt ist weder mit Thera Interactive verbunden noch von Thera Interactive unterstützt, gesponsert oder autorisiert.
