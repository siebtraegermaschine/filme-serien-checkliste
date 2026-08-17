# MovieMatch — Ideen, Roadmap & offene Punkte

*Lebende Projektdatei. Status-Spalten selbst pflegen: `offen` / `läuft` / `fertig` / `verworfen`.*

**Änderungsprotokoll** (neueste zuerst)

| Datum | Änderung |
|---|---|
| 2026-08-16 | Datei angelegt: Feature-Roadmap Stufe 0–3, bewusst verworfene Features, 90-Tage-Reihenfolge, offene Punkte. |
| 2026-08-16 | KPI-Erfassung + Dashboard umgesetzt → nicht mehr Teil dieser Datei. |

---

## 1 — Priorisierte Feature-Roadmap

Wirkung 1–5 bezogen auf die Kennzahl, die das Feature tatsächlich bewegt. Aufwand: **S** = bis 3 Tage, **M** = 1–2 Wochen, **L** = 3+ Wochen (mit Claude Code, nicht mit Team). Status: `offen` / `läuft` / `fertig` / `verworfen` — bitte selbst pflegen.

### Stufe 0 — Fundament

| # | Feature | Bewegt | Wirkung | Aufwand | Status |
|---|---|---|---|---|---|
| 0.1 | Verfügbarkeitsdaten mit sichtbarem Prüfzeitstempel + „Stimmt nicht“-Knopf je Titel | Vertrauen (alle KPIs) | 5 | M | offen |
| 0.2 | Mediatheken DE/AT/CH: ARD, ZDF, Arte, 3sat, Joyn, RTL+ | Alleinstellung, MAU-Basis | 5 | L | offen |
| 0.3 | Datenexport + verlässliche Synchronisation | Churn-Vermeidung | 3 | S | offen |

Begründung 0.1: Falsche Verfügbarkeit ist der Rufkiller der Kategorie (siehe B4). Ein sichtbarer Zeitstempel verwandelt einen Vertrauensbruch in einen ehrlichen Hinweis.
Begründung 0.2: Teuerstes Fundament, aber der einzige strukturelle Vorsprung gegenüber internationalen Anbietern. Erweitert die Zielgruppe über Streaming-Abonnenten hinaus. Läuft als Daten-/Lizenzprojekt parallel, nicht als Sprint.

### Stufe 1 — Kern-Loop (Aktivierung + Viralität)

| # | Feature | Bewegt | Wirkung | Aufwand | Status |
|---|---|---|---|---|---|
| 1.1 | **Gastmodus ohne Account**: Link öffnen, sofort mitswipen, kein Download | `invite_accept_rate`, K-Faktor | 5 | M | offen |
| 1.2 | Einladungsvorschau: Empfänger sieht vor dem Klick, wer einlädt und worum es geht | `invite_accept_rate` | 4 | S | offen |
| 1.3 | Kalibrierung auf 10 Titel kürzen statt 30–50 | `activation_rate`, `time_to_first_match` | 5 | S | offen |
| 1.4 | **Persistente Gruppen** mit Namen und eigener Historie („Haushalt“, „Freitagsrunde“) | `group_retention_m1` | 5 | M | offen |
| 1.5 | Einladung im Erstflow verankert, nicht im Menü versteckt | `invites_per_user` | 4 | S | offen |

1.1 ist der einzelne größte Hebel im Produkt. Jede Reibung beim Zweitnutzer halbiert den Loop, und der Loop ist die einzige bezahlbare Wachstumsquelle — bei 0,55–0,83 € Jahresumsatz je Nutzer ist bezahlte Nutzergewinnung rechnerisch tot.
1.4 verwandelt Sitzungen in Beziehungen und ist der einzige echte Wechselkostenerzeuger.

### Stufe 2 — Retention und Solo-Nutzen

| # | Feature | Bewegt | Wirkung | Aufwand | Status |
|---|---|---|---|---|---|
| 2.1 | **Verfügbarkeits-Benachrichtigung**: „Steht jetzt auf deinem Dienst“ | `d30`, Abo-Conversion | 5 | M | offen |
| 2.2 | **Mediathek-Ablaufwarnung**: „Nur noch 6 Tage verfügbar“ | `d30`, Sessions | 5 | S nach 0.2 | offen |
| 2.3 | Kontextfilter: verfügbare Zeit, Kinder dabei, Sprache, Stimmung | `activation_rate` | 4 | M | offen |
| 2.4 | Entscheidungsversprechen: jede Session endet mit max. 3 Vorschlägen | Abschlussquote | 4 | S | offen |
| 2.5 | Das Danach: 30-Sekunden-Bewertung nach dem Schauen, Gruppenvergleich | `profiled_users`, Retention | 4 | M | offen |
| 2.6 | Ritual-Trigger: Push an aktive Gruppen zum tatsächlichen Anlass | Sessions/Gruppe | 3 | S | offen |

2.1 ist das einzige Feature der Kategorie, für das nachweislich gezahlt wird. 2.2 gibt es nirgends, weil niemand die Mediatheken sauber abbildet — Ablauffristen erzeugen echte Dringlichkeit statt künstlicher Pushs.
2.4 ist die Positionierung: Alle anderen zeigen mehr Auswahl. Wir zeigen weniger.

### Stufe 3 — Erlös und B2B-Vorbereitung

| # | Feature | Bewegt | Wirkung | Aufwand | Status |
|---|---|---|---|---|---|
| 3.1 | **Ablehnungsdaten sauber erfassen**: Impression + Veto + Kontext | B2B-Asset | 5 | S | offen |
| 3.2 | Affiliate-Deeplinks mit Klick- und Conversion-Tracking | Erlös | 3 | M | offen |
| 3.3 | Abo: werbefrei, unbegrenzte Gruppen, Jahresrückblick | `mrr` | 2 | M | offen |
| 3.4 | Kinoprogramm in der Nähe + Gruppenverabredung | neuer Anlass, Türöffner Verleiher | 4 | L | offen |

**3.1 ist der wichtigste kleine Punkt der ganzen Liste.** Ab dem ersten Nutzer erfassen, welcher Titel gesehen und bewusst abgelehnt wurde, mit Kontext (Gruppe, Uhrzeit, Position im Stapel). Diese Daten hat sonst niemand, sie sind das eigentliche B2B-Verkaufsgut — und rückwirkend nicht erzeugbar.

## 2 — Bewusst nicht bauen

| Verworfen | Grund |
|---|---|
| Öffentliche Rezensionen / Community | Hoher Aufwand, Moderationslast, Witzbeiträge verdrängen nützliche Kritik. Letterboxd besetzt das Feld. |
| Serien-Episodentracking | Trakt und JustWatch machen es besser, differenziert nicht. |
| KI-Chat als Empfehlungsoberfläche | Löst das Problem nicht — bei einer Gruppe geht es ums Einigen, nicht ums Formulieren. |
| Watch-Party / synchrones Abspielen | Rechtlich und technisch teuer, Plattformen haben es selbst. |
| Abo als primäres Erlösmodell | B2C-Entertainment-Discovery: erwartbar 0,5–2 % Conversion. |

## 3 — 90-Tage-Reihenfolge

| Zeitraum | Inhalt | Erfolgskriterium |
|---|---|---|
| Woche 1–2 | 3.1 und 1.3 | Erste belastbare Aktivierungswerte im Cockpit, Datenaufbau startet |
| Woche 3–6 | 1.1 und 1.2 | K-Faktor vorher/nachher messen |
| Woche 7–10 | 1.4 und 0.1 | Gruppen als Objekt, Vertrauenssicherung |
| Woche 11–13 | 2.2 (falls 0.2 steht), sonst 2.1 | Erster Solo-Nutzen live |
| durchgehend | 0.2 als Daten-/Lizenzprojekt | Mediatheken angebunden |

**Die Wette des Quartals ist 1.1.** Wenn der K-Faktor nach dem Gastmodus nicht über 0,3 geht, trägt der Loop nicht — dann ist das Consumer-Produkt als Wachstumsmotor erledigt und das Geschäft läuft über den B2B-Teil. Diese Information ist mehr wert als jedes weitere Feature.

## 4 — Offene Punkte

| # | Frage | Warum kritisch | Aufwand | Status |
|---|---|---|---|---|
| O1 | Zahlen DACH-Verleiher 15–20 % Fee an einen Neuling? Drei Gespräche. | 89 % des Jahr-1-Umsatzes hängen daran | 2 Wochen, 0 € | offen |
| O2 | Was kosten belastbare Verfügbarkeitsdaten für DACH inkl. Mediatheken? Angebote einholen. | Größte Unsicherheit in der Kostenplanung | 1 Woche | offen |
| O3 | Kann die App heute einen Gast ohne Account teilnehmen lassen? | Entscheidet über den K-Faktor | Prüfung: 1 Tag | offen |
| O4 | Sind Gruppen und Match-Sessions im Datenmodell eigene Entitäten? | Voraussetzung für 1.4 und die halbe KPI-Logik | ergibt sich aus Schritt 0 | offen |
| O5 | Aktueller Funktionsumfang — was von B1 existiert schon? | Roadmap ist ungeprüft gegen den Ist-Stand | 1 Std. | offen |
| O6 | Trägt der Loop? K-Faktor nach 1.1 messen. | Entscheidet über die gesamte Wachstumsstrategie | ab 500 Nutzern | offen |

O1 und O2 kosten zusammen zwei Wochen und kein Geld. Beide vor weiterer Entwicklung erledigen.

