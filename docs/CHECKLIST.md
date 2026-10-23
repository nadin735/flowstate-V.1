# CHECKLIST.md

Diese Checkliste gilt für jeden Build, jede Änderung und jeden Export. Vor dem Abschluss einer Aufgabe alle drei Teile prüfen. Nichts davon auslassen.

## 1. Projekt-Dateien – nie auslassen

Beim Export (ZIP), beim Kopieren oder beim Start einer neuen Session muss der Ordner `docs/` vollständig enthalten sein:

- [ ] `docs/PRD.md` – Ziele, Features, Zielgruppe
- [ ] `docs/ARCHITECTURE.md` – Aufbau, Tech-Stack, Datenbank, Ordnerstruktur
- [ ] `docs/RULES.md` – Coding-Regeln
- [ ] `docs/DESIGN.md` – Farben, Schriften, Abstände, Komponenten
- [ ] `docs/TASKS.md` – erledigt / offen / als Nächstes
- [ ] `docs/MEMORY.md` – Entscheidungen und Kontext aus früheren Sessions
- [ ] `docs/CHECKLIST.md` – diese Datei

Außerdem immer mit dabei:

- [ ] `src/` vollständig
- [ ] `package.json` und Lockfile
- [ ] Config-Dateien (z. B. `next.config`, `tsconfig.json`, Tailwind-/ESLint-Config)
- [ ] `.env.example` mit allen Variablennamen, ohne Werte

Niemals mit exportieren:

- [ ] `.env` / `.env.local` mit echten Schlüsseln
- [ ] `node_modules/`, Build-Ordner (`.next/`, `dist/`)

Nach jeder Arbeitssitzung `TASKS.md` und `MEMORY.md` aktualisieren.

## 2. Design – keine „Vibecoded“-Merkmale

Vor dem Abschluss jedes UI-Tasks prüfen, dass nichts davon vorkommt:

- [ ] Kein farbiger Streifen auf abgerundeten Karten
- [ ] Keine Rahmen um jeden Block
- [ ] Keine farbige Kursivschrift als Akzent
- [ ] Kein Großbuchstaben-Label über jeder Überschrift
- [ ] Keine Badges oder Punkte ohne Bedeutung
- [ ] Keine Monospace-Schrift für Labels und Eingabefelder
- [ ] Zahlen als Ziffern, nicht als Wörter
- [ ] Kurze, klare Titel statt Substantiv-Ketten
- [ ] Keine Emojis als Icons – ein einheitliches Icon-Set verwenden
- [ ] Echte Avatare, Logos und Bilder statt Platzhalter
- [ ] Keine überladenen Screens – Weißraum lassen, eine Hauptaktion pro Screen
- [ ] Keine visuellen Metaphern, die mit Labels erklärt werden müssen
- [ ] Demos echt zeigen (Screenshot, Video, interaktiv), nicht als Text beschreiben
- [ ] Keine Glas-Karten (Glassmorphism)
- [ ] Radius und Schatten bewusst einsetzen, nicht überall identisch
- [ ] Kein hellgrauer Text auf Weiß – Kontrast mind. WCAG AA (4,5:1)
- [ ] Animationen nur, wenn sie etwas erklären oder Feedback geben
- [ ] Keine schweren Einblend-Animationen bei jedem Block
- [ ] Keine lila Verläufe
- [ ] Kein Glow, Neon oder Gitterlinien auf dunklem Hintergrund
- [ ] Keine unprüfbaren Belege: keine erfundenen Testimonials, Fake-Firmenlogos oder Zahlen wie „10.000+ Teams“

## 3. Rechtliches – kostenlose App ohne Einnahmen (Deutschland/EU)

### Pflicht bzw. dringend nötig

- [ ] Keine geheimen Schlüssel im Frontend – Secrets nur serverseitig, nur öffentliche Keys im Client
- [ ] RLS (Row Level Security) auf jeder Tabelle – jede Tabelle hat Policies, Nutzer sehen nur ihre eigenen Daten
- [ ] Datenschutzerklärung – gilt auch ohne Einnahmen, sobald personenbezogene Daten verarbeitet werden (Login, E-Mail, Uploads, Logs)
- [ ] Einwilligung vor Tracking – Cookie-Banner, bevor Analytics, Chat-Widgets oder Session-Replay laden; ohne Einwilligung nichts davon laden
- [ ] Impressum – Name und ladungsfähige Anschrift, von jeder Seite aus erreichbar
- [ ] AV-Verträge mit allen Dienstleistern, die Nutzerdaten verarbeiten (z. B. Supabase, Vercel, E-Mail-Dienst); Hosting möglichst in der EU
- [ ] Konto- und Datenlöschung – Nutzer können ihr Konto und ihre Daten selbst löschen
- [ ] Google Fonts lokal einbinden – nicht über das Google-CDN laden
- [ ] Lizenzen prüfen – nur Bilder, Schriften und Icons mit passender Lizenz

### Nur relevant, wenn die Funktion genutzt wird

- [ ] SMS nur mit Opt-in – ausdrückliche Zustimmung vor dem ersten Versand
- [ ] Abmeldelink in jeder Newsletter-/Marketing-Mail – reine System-Mails (Passwort-Reset, Bestätigung) brauchen keinen

### Empfohlen (ohne Einnahmen meist keine Pflicht)

- [ ] Tastatur + Screenreader – alle Funktionen per Tastatur erreichbar, sichtbarer Fokus, Alt-Texte, Labels an Formularfeldern

### Entfällt, solange es keine Einnahmen gibt

- Steuern
- AGB mit Zahlungsbedingungen, Widerrufsbelehrung

> Sobald die App Geld einbringt (Abo, Werbung, Verkauf), diesen Teil neu prüfen: Steuern, AGB, Widerrufsrecht und Barrierefreiheitsgesetz (BFSG) kommen dann dazu.

_Hinweis: Keine Rechtsberatung. Impressum und Datenschutzerklärung z. B. mit einem Generator (eRecht24) erstellen oder prüfen lassen._
