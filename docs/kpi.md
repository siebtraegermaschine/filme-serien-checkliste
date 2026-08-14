# KPI-Erfassung

Wöchentliche Kennzahlen für das externe KPI-Cockpit ([KpiCockpit.jsx](KpiCockpit.jsx)).
**Feldnamen, Einheiten und Definitionen sind bindend** — das Cockpit liest exakt
dieses Format, nichts umbenennen oder "verbessern".

## Architektur

- **`analytics_events`** (schema.sql): append-only Ereignistabelle. Schreibt
  ausschließlich `lib/track.js` — kein direktes INSERT an anderer Stelle.
- **`anon_id`**: zufälliger 32-Hex-Wert im httpOnly-Cookie `mt_anon`
  (`middleware/anonId.js`). Kein Personenbezug: keine IP, keine Kontonummer.
  Verbindet Ereignisse desselben Geräts (DAU/WAU/MAU, Retention, Gast→Konto).
- **`POST /api/events`** (`routes/events.js`): schmale Route für die wenigen
  zwingend clientseitigen Ereignisse (`app_opened`, `invite_opened`,
  `invite_accepted` als Gast, `affiliate_click`). Strenge props-Prüfung, nur
  Aufzählungswerte und Nummern — nie Freitext. Alles andere entsteht
  serverseitig und ist vom Client nicht auslösbar.
- **`lib/kpi.js`**: `buildSnapshot(from, to)` berechnet alle Felder;
  `starteKpiSnapshot()` legt montags ab 06:00 Europe/Berlin den Snapshot der
  Vorwoche in `kpi_snapshots` ab (nachgeholt, falls der Montag verpasst wurde).
- **`kpi_snapshots`**: nie überschrieben, sondern versioniert —
  Primärschlüssel `(week_start, version)` statt `week_start` allein.

## Ereignisse

| Event | Wann | props | Quelle |
|---|---|---|---|
| `app_opened` | erste Interaktion je Tag und Gerät | `{ platform: ios\|android\|desktop }` | Client |
| `user_signed_up` | Registrierung abgeschlossen | `{ source: organic\|share\|referral, invite_id\|null, was_guest }` | `routes/auth.js` |
| `group_created` | — Gruppen existieren nicht als Entität; wird nie ausgelöst | | |
| `invite_sent` | Einladung erzeugt | `{ invite_id, channel: share\|referral }` | `routes/links.js` |
| `invite_opened` | Gerät öffnet `?ref=`/`?einladung=`-Link (einmal je Token) | `{ invite_id }` | Client |
| `invite_accepted` | mit Konto: Annehmen-Knopf; als Gast: erste Markierung oder Movie-Night-Stimme nach Einladungslink | `{ invite_id, guest }` | `routes/links.js` / Client |
| `session_started` | Movie-Night-Runde angelegt | `{ participant_count: 1 }` | `routes/movieNight.js` |
| `title_rated` | Movie-Night-Stimme (`yes`/`no`), Gesehen-/Watchlist-Markierung (`seen`/`watchlist`), Sterne (`stars`) | `{ title_id, verdict, participant_count? }` | `routes/movieNight.js`, `routes/progress.js` |
| `match_completed` | einmal je Runde: ≥2 Teilnehmende und ≥1 Titel mit Ja von allen | `{ participant_count, title_id }` | `routes/movieNight.js` |
| `affiliate_click` | Klick auf Ansehen/Leihen/Kaufen-Anbieterlink | `{ provider, title_id }` | Client |
| `affiliate_conversion` / `subscription_*` | vorgesehen, aber ohne Auslöser — es gibt (noch) keine Partner-Postbacks und keine Abos | | |

`invite_id` ist immer der **SHA-256-Hash** des Einladungstokens (wie in
`user_link_invites`) — der einlösbare Rohtoken wird nie gespeichert.

Der Gast-Pfad: `invite_accepted` mit `guest: true` verknüpft `anon_id` und
`invite_id`; ein späteres `user_signed_up` desselben Geräts trägt
`was_guest: true` und ist so demselben Einladungspfad zuordenbar.

## Kennzahlen-Regeln

- Zeitfenster: Montag 00:00 bis Sonntag 23:59:59 der abgeschlossenen Woche,
  Europe/Berlin (Grenzen entstehen in SQL über `AT TIME ZONE`).
- Prozentwerte als Dezimalzahl 0–1. Rundung auf 4 Nachkommastellen.
- Nichts wird geschätzt: fehlende Datengrundlage oder Division durch null
  ergibt `null`. Gab es das Basis-Ereignis vor dem Fensterende noch nie
  (Erfassung war noch nicht live), ist der Wert `null` — deshalb bleiben
  DAU/WAU/MAU und Retention für Wochen vor der Einführung leer.
- **Ehrliche Nullen statt `null`** bei Monetarisierung (`paying_users`, `mrr`,
  `affiliate_revenue_month`, `ad_revenue_month`, `b2b_*`): die Produkte
  existieren nicht, 0 € ist eine Tatsache, kein Schätzwert.
- **Gruppen existieren nicht als Entität** (nur paarweise `user_links`) —
  `sessions_per_group_month`, `group_retention_m1`, `active_groups` sind
  bewusst `null`, bis es echte Gruppen gibt. `avg_group_size` ist per
  Definition sessionbezogen und wird berechnet: je Session das Maximum des
  mitgeschriebenen `participant_count`.
- Retention-Kohorten (vollständige Fenster): `d1`/`d7` = Anmeldungen der
  Vorwoche der Berichtswoche, `d30` = Anmeldungen der Woche fünf Wochen davor.
  Gemessen an `app_opened` derselben `anon_id` (Gerät).
- `cycle_time_days`: Nutzer, deren **erste** Einladung im Fenster liegt;
  Median der Tage seit ihrer Anmeldung.
- `cac`: braucht eine Zeile in `marketing_spend(week, amount_eur)` (week =
  Montag der Woche); ohne Zeile `null`.
- `b2b_pipeline`/`b2b_arr`: aus `b2b_deals(status, value_eur)` mit Status
  `offen`/`gewonnen`/`verloren`, von Hand gepflegt.

## Endpunkt

```
GET /api/kpi/snapshot                  → letzte abgeschlossene Woche
GET /api/kpi/snapshot?from=…&to=…      → beliebiges Fenster (ISO-Datum)
GET /api/kpi/snapshot?format=text      → dasselbe JSON als text/plain
GET|POST /api/kpi/rebuild?weeks=12     → fehlende Wochen-Snapshots anlegen
                                         (&force=1: neue Version daneben)
```

Auth: Header `x-kpi-token`, Wert aus `KPI_TOKEN` (backend/.env). Keine
Session-Auth, damit curl und Cockpit direkt zugreifen können. CORS
(`Access-Control-Allow-Origin: *`) gilt nur für diese Routen.

```bash
curl -H "x-kpi-token: $KPI_TOKEN" https://movietaste.de/api/kpi/snapshot
```

## Ansehen

- **Handy/Browser:** [movietaste.de/kpi.html](../kpi.html) — fragt den Token
  einmal ab, behält ihn im `localStorage` des Geräts und blättert per Pfeil
  durch die Wochen. Die Seite trägt `noindex`, und robots.txt sperrt ohnehin
  alles außer der Startseite; ohne Token ist sie wertlos, die Sperre sitzt im
  Backend.
- **Terminal:** `kpi` (persönliches Skript, nicht im Repo — liegt unter
  `~/.local/bin/kpi`, Token in `~/.movietaste-kpi-token`). `kpi VON BIS` für
  eine bestimmte Woche, `kpi --json` für die Rohdaten.

### Was `KpiCockpit.jsx` zusätzlich erwartet

Die mitgelieferte Cockpit-Datei ist **noch nicht lauffähig**. Sie ist React
(die App hat keinen Build-Schritt) und erwartet laut ihrem Kopfkommentar vier
Endpunkte mehr, dazu **Session-Auth statt Token** („Der KPI_TOKEN gehört
ausschließlich in Cron und curl, niemals in diesen Client"):

| Endpunkt | Zweck | Status |
|---|---|---|
| `GET /api/kpi/snapshot` | Wochenwerte | **vorhanden** |
| `GET /api/kpi/history?weeks=26` | Verlauf `[{t, north, mau}]` für die Kurven | fehlt |
| `GET/PUT /api/kpi/targets` | Zielwerte je Kennzahl (Ampelfarben) | fehlt |
| `GET/PUT /api/kpi/plan` | Planungsrechner (targetMau, months, retention, k) | fehlt |

Für die Session-Auth bräuchte es außerdem einen Admin-Begriff — den gibt es
im Datenmodell nicht (keine Rolle, kein Flag an `users`). Solange das offen
ist, ist `kpi.html` der Weg; die Werte sind dieselben.

## Betrieb

- `npm run kpi:verify` — Snapshot der letzten Woche plus Begründung für jedes
  `null`-Feld.
- `npm run kpi:backfill` — einmalig nach dem Deploy: rekonstruiert historische
  Ereignisse aus `users`, `user_link_invites`/`_uses`, `user_progress` und den
  Movie-Night-Tabellen (markiert mit `props.backfilled`, idempotent).
  `app_opened` ist nicht rekonstruierbar (der alte Trichter `metrik_tage`
  trägt bewusst keine Kennungen). Danach `GET /api/kpi/rebuild?weeks=12`.
- `npm test` — Tests für `buildSnapshot` mit festem Seed und von Hand
  gerechneten Sollwerten (`backend/test/kpi.test.js`).

## Datenschutz

Keine Klarnamen, E-Mail-Adressen oder IPs in `analytics_events`; `props`
enthält nie Freitext aus Nutzereingaben. Keine externen Analytics-SDKs —
alles bleibt in der eigenen Datenbank.

Beschrieben in **Abschnitt 4** der Datenschutzerklärung
([datenschutz.html](../datenschutz.html) / [privacy.html](../privacy.html)),
Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO. Zwei Zusagen daraus hängen direkt
am Code — wer sie ändert, muss den Text mitändern:

- **Cookie-Laufzeit sechs Monate** (`MAX_AGE_MS` in `middleware/anonId.js`).
  Reicht für jede Kennzahl: die weiteste Rückschau ist `d30` (Kohorte plus 30
  Tage Beobachtung, gut fünf Wochen).
- **Einzelereignisse werden nach 14 Monaten gelöscht**
  (`starteKpiAufraeumen()` in `lib/kpi.js`, täglicher Lauf). Die
  Wochen-Snapshots in `kpi_snapshots` bleiben — sie enthalten nur noch Summen
  ohne jede Kennung.

Bewusst in Kauf genommen: § 25 TDDDG verlangt für nicht zwingend erforderliche
Speicherung auf dem Endgerät grundsätzlich eine Einwilligung, und
Reichweitenmessung fällt nach Auffassung der Aufsichtsbehörden meist nicht
unter die Ausnahme. Entscheidung vom 14.08.2026: ohne Banner, dafür knappe
Speicherfristen, klare Beschreibung und Widerspruchsmöglichkeit. Vor einer
größeren Reichweite anwaltlich prüfen lassen.
