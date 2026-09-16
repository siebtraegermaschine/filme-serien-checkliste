/* Kennzahlen-Ansicht fuer den Betreiber (Christian, 16.09.2026) -- nach dem
   Vorbild von CouchUltras (backend/routes/analytics.js dort).
   GET /api/analytics liefert die KPI-Tabelle der App -- AUSSCHLIESSLICH fuer
   das Betreiber-Konto (ANALYTICS_EMAIL, standardmaessig
   c.neubauer@digital-wings.com). Der Menuepunkt im Frontend ist nur Komfort;
   die Zugangskontrolle sitzt HIER: Jede andere Kennung bekommt 404 (nicht
   403 -- die Route muss fuer Fremde gar nicht existieren).

   Je KPI vier Spalten: Gesamt, heute (letzte 24 h), letzte 7 Tage, letzte
   30 Tage -- die drei Fenster bringen ihren Vergleich (Vortag, Vorwoche,
   Vormonat) mit, das Frontend zeigt ihn klein in derselben Zelle.

   Alle Zahlen sind zusammengefasste Zaehlungen ohne Personenbezug -- genau
   die Auswertung, die Abschnitt 4 der Datenschutzerklaerung beschreibt.
   Die Wochen-Snapshots fuer das externe Cockpit (lib/kpi.js) bleiben davon
   unberuehrt; diese Route rechnet live und ist bewusst einfacher. */
import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SYSTEM_ANON_ID } from '../lib/track.js';

const router = createAsyncRouter();

const ANALYTICS_EMAIL = (process.env.ANALYTICS_EMAIL || 'c.neubauer@digital-wings.com').toLowerCase();

// Exportiert, damit die Zugangsregel ohne Datenbank testbar ist.
export function istBetreiber(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ANALYTICS_EMAIL;
}

async function zahl(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0] && rows[0].n || 0);
}
/* Zaehlung einer Tabelle in einem Tage-Fenster [von, bis) vor jetzt.
   Tabelle/Spalte/Zusatz sind feste Strings aus DIESEM Modul -- niemals
   Nutzereingaben (SQL-Baukasten, keine Injection-Flaeche). */
function fenster(tabelle, spalte, von, bis, zusatz = '', params = []) {
  return zahl(
    `SELECT count(*) AS n FROM ${tabelle}
      WHERE ${spalte} >= now() - ($1 || ' days')::interval
        AND ${spalte} < now() - ($2 || ' days')::interval${zusatz}`,
    [String(von), String(bis), ...params]);
}
const ereignisse = (name, von, bis, zusatz = '') =>
  fenster('analytics_events', 'ts', von, bis, ` AND name = $3${zusatz}`, [name]);
const geraete = (von, bis) => zahl(
  `SELECT count(DISTINCT anon_id) AS n FROM analytics_events
    WHERE name = 'app_opened' AND anon_id <> $3
      AND ts >= now() - ($1 || ' days')::interval
      AND ts < now() - ($2 || ' days')::interval`,
  [String(von), String(bis), SYSTEM_ANON_ID]);
/* Wiederkehrer-Quote eines 7-Tage-Fensters: Anteil der Geraete des Fensters
   DAVOR, die im Fenster selbst wieder geoeffnet haben. offset = Tage
   zwischen "jetzt" und dem Ende des betrachteten Fensters. */
async function wiederkehrerQuote(offset) {
  const [wieder, basis] = await Promise.all([
    zahl(
      `SELECT count(DISTINCT a.anon_id) AS n FROM analytics_events a
        WHERE a.name = 'app_opened' AND a.anon_id <> $2
          AND a.ts >= now() - (($1::int + 7) || ' days')::interval
          AND a.ts <  now() - ($1 || ' days')::interval
          AND EXISTS (SELECT 1 FROM analytics_events b
                       WHERE b.name = 'app_opened' AND b.anon_id = a.anon_id
                         AND b.ts >= now() - (($1::int + 14) || ' days')::interval
                         AND b.ts <  now() - (($1::int + 7) || ' days')::interval)`,
      [String(offset), SYSTEM_ANON_ID]),
    geraete(offset + 14, offset + 7),
  ]);
  return basis > 0 ? Math.round((wieder / basis) * 100) : null;
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
  if (!rows[0] || !istBetreiber(rows[0].email)) {
    return res.status(404).json({ error: 'not_found' });
  }

  // Nur menschliche SEO-Aufrufe zaehlen -- Crawler stehen mit bot:true dabei.
  const ohneBots = ` AND (props->>'bot') IS DISTINCT FROM 'true'`;
  /* Je zaehlbarer Groesse: [gesamt, 1 Tag, Vortag, 7 Tage, Vorwoche,
     30 Tage, Vormonat] -- "1 Tag" sind die letzten 24 Stunden, der
     Vergleich die 24 Stunden davor. */
  const satz = (gesamtSql, gesamtParams, zaehler) => Promise.all([
    zahl(gesamtSql, gesamtParams),
    zaehler(1, 0), zaehler(2, 1),
    zaehler(7, 0), zaehler(14, 7), zaehler(30, 0), zaehler(60, 30),
  ]);
  const ereignisSatz = (name, zusatz = '') => satz(
    `SELECT count(*) AS n FROM analytics_events WHERE name = '${name}'${zusatz}`, [],
    (v, b) => ereignisse(name, v, b, zusatz));

  const [
    konten, kontenMitOptIn, oeffnungen, geraeteWerte, quote7, quoteVorwoche,
    einstieg, markierungen, einladungen, eingeloest, verknuepfungen,
    movieNights, momentaufnahmen, feedback, seo, seoTexte,
  ] = await Promise.all([
    satz('SELECT count(*) AS n FROM users', [], (v, b) => fenster('users', 'created_at', v, b)),
    zahl('SELECT count(*) AS n FROM users WHERE benachrichtigung = true'),
    ereignisSatz('app_opened'),
    Promise.all([
      zahl(`SELECT count(DISTINCT anon_id) AS n FROM analytics_events WHERE name = 'app_opened' AND anon_id <> $1`, [SYSTEM_ANON_ID]),
      geraete(1, 0), geraete(2, 1),
      geraete(7, 0), geraete(14, 7), geraete(30, 0), geraete(60, 30),
    ]),
    wiederkehrerQuote(0),
    wiederkehrerQuote(7),
    satz('SELECT count(*) AS n FROM user_onboarding WHERE abgeschlossen_am IS NOT NULL', [],
      (v, b) => fenster('user_onboarding', 'abgeschlossen_am', v, b)),
    ereignisSatz('title_rated'),
    satz('SELECT count(*) AS n FROM user_link_invites', [], (v, b) => fenster('user_link_invites', 'created_at', v, b)),
    satz('SELECT count(*) AS n FROM user_link_invite_uses', [], (v, b) => fenster('user_link_invite_uses', 'accepted_at', v, b)),
    // user_links traegt je Verknuepfung zwei Zeilen (beide Richtungen).
    satz('SELECT count(*) / 2 AS n FROM user_links', [],
      (v, b) => zahl(`SELECT count(*) / 2 AS n FROM user_links
                       WHERE created_at >= now() - ($1 || ' days')::interval
                         AND created_at <  now() - ($2 || ' days')::interval`, [String(v), String(b)])),
    satz('SELECT count(*) AS n FROM movie_night_runden', [], (v, b) => fenster('movie_night_runden', 'created_at', v, b)),
    satz('SELECT count(*) AS n FROM titel_momentaufnahmen', [], (v, b) => fenster('titel_momentaufnahmen', 'created_at', v, b)),
    // ACHTUNG: die Feedback-Tabelle nennt ihre Zeitspalte erstellt_am.
    satz('SELECT count(*) AS n FROM feedback', [], (v, b) => fenster('feedback', 'erstellt_am', v, b)),
    ereignisSatz('seo_aufruf', ohneBots),
    satz(`SELECT count(*) AS n FROM seo_content WHERE bereich = 'titel'`, [],
      (v, b) => fenster('seo_content', 'erstellt_am', v, b, ` AND bereich = 'titel'`)),
  ]);

  /* Zeilenform: gesamt sowie t1/t7/t30 jeweils mit Vergleichswert (Vortag,
     Vorwoche, Vormonat) -- null heisst "fuer diese Groesse nicht sinnvoll". */
  const zeile = (label, [gesamt, t1, t1v, t7, t7v, t30, t30v], einheit = '') =>
    ({ label, gesamt, t1, t1v, t7, t7v, t30, t30v, einheit });
  const nurGesamt = (label, gesamt) => zeile(label, [gesamt, null, null, null, null, null, null]);
  res.set('Cache-Control', 'no-store');
  res.json({
    stand: new Date().toISOString(),
    zeilen: [
      zeile('App-Öffnungen (1× je Gerät und Tag)', oeffnungen),
      zeile('Eindeutige Geräte', geraeteWerte),
      zeile('Wiederkehrer-Quote (Woche zu Woche)', [null, null, null, quote7, quoteVorwoche, null, null], '%'),
      zeile('SEO-Seitenaufrufe ohne Crawler', seo),
      zeile('Konten', konten),
      nurGesamt('Konten mit Benachrichtigungs-Opt-in', kontenMitOptIn),
      zeile('Einstieg abgeschlossen (Onboarding)', einstieg),
      zeile('Markierungen (Watchlist, Gesehen, Sterne, Stimmen)', markierungen),
      zeile('Einladungen erzeugt', einladungen),
      zeile('Einladungen angenommen', eingeloest),
      zeile('Verknüpfte Profile', verknuepfungen),
      zeile('Movie-Night-Runden', movieNights),
      zeile('Titel geteilt (Momentaufnahmen)', momentaufnahmen),
      zeile('Feedback-Nachrichten', feedback),
      zeile('SEO-Titeltexte in der Datenbank', seoTexte),
    ],
  });
});

export default router;
