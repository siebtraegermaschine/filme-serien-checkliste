/* KPI-Aggregation (docs/kpi.md).
 *
 * buildSnapshot(from, to) berechnet den woechentlichen Kennzahlen-Snapshot
 * EXAKT im Format, das das externe KPI-Cockpit liest -- Feldnamen, Einheiten
 * und Definitionen sind bindend und duerfen nicht umbenannt werden.
 *
 * Regeln fuer alle Felder:
 *   - Prozentwerte als Dezimalzahl 0..1, nie 0..100.
 *   - Nichts wird geschaetzt: fehlt die Datengrundlage, kommt null -- nicht 0.
 *     Fuer jede Kennzahl mit Ereignis-Basis gilt: Gab es das Basis-Ereignis
 *     vor dem Fensterende noch nie (Erfassung war noch nicht live), ist der
 *     Wert null. Monetarisierung (paying_users, mrr, affiliate/ad revenue,
 *     b2b) ist dagegen eine ehrliche 0, solange es die Produkte nicht gibt.
 *   - Division durch null ergibt null.
 *   - Gerundet auf 4 Nachkommastellen.
 *
 * Gruppen existieren in der App (noch) nicht als Entitaet -- die rein
 * gruppenbezogenen Felder (sessions_per_group_month, group_retention_m1,
 * active_groups) liefern deshalb bewusst null statt einer Umdeutung.
 * avg_group_size ist per Definition sessionbezogen und bleibt berechenbar.
 *
 * Zeitfenster: from = Montag, to = Sonntag derselben Woche, Europe/Berlin.
 * Alle Grenzen entstehen in SQL ueber AT TIME ZONE, damit Sommer-/Winterzeit
 * die Wochen nicht verschiebt. */
import { pool } from '../db/pool.js';

const TZ = 'Europe/Berlin';
// Fensteranfang (inkl.) und -ende (exkl.) als timestamptz, aus $1/$2 (date).
const FS = `($1::date::timestamp AT TIME ZONE '${TZ}')`;
const FE = `(($2::date + 1)::timestamp AT TIME ZONE '${TZ}')`;
// Vorwoche (Kohortenfenster fuer activation_rate, time_to_first_match,
// guest_signup_rate, d1/d7): Montag..Sonntag vor `from`.
const VS = `(($1::date - 7)::timestamp AT TIME ZONE '${TZ}')`;
const VE = FS;
// Fensterende als $1 (uebergeben wird dann [to]) -- fuer Abfragen, die NUR
// das Ende brauchen: Postgres verlangt, dass jede uebergebene Parameter-
// nummer auch vorkommt.
const FE1 = `(($1::date + 1)::timestamp AT TIME ZONE '${TZ}')`;

function rund(x) {
  if (x == null || Number.isNaN(Number(x))) return null;
  return Math.round(Number(x) * 10000) / 10000;
}
function ganz(x) {
  if (x == null || Number.isNaN(Number(x))) return null;
  return Math.round(Number(x));
}
// Division mit "durch null ergibt null".
function quote(zaehler, nenner) {
  if (zaehler == null || nenner == null || Number(nenner) === 0) return null;
  return rund(Number(zaehler) / Number(nenner));
}

export async function buildSnapshot(from, to) {
  const p = [from, to];
  const gruende = {}; // feld -> warum null (fuer npm run kpi:verify)
  const metrics = {};

  /* Wann wurde jedes Ereignis erstmals erfasst? Grundlage fuer die
     "Datengrundlage fehlt"-Entscheidung bei rueckwirkenden Wochen. */
  const { rows: ersteRows } = await pool.query(
    `SELECT name, MIN(ts) AS erste FROM analytics_events GROUP BY name`
  );
  const erste = Object.fromEntries(ersteRows.map((r) => [r.name, r.erste]));
  const { rows: [fenster] } = await pool.query(
    `SELECT ${FE} AS fe, ($2::date - $1::date + 1) AS tage`, p
  );
  const basisDa = (name) => erste[name] != null && erste[name] < fenster.fe;
  const ohneBasis = (feld, name) => {
    gruende[feld] = `kein Event ${name} vor Fensterende erfasst`;
    return null;
  };

  /* ---- Zaehlungen im Fenster ---- */
  const { rows: [z] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE name = 'match_completed'
                          AND (props->>'participant_count')::int >= 2) AS matched,
       COUNT(*) FILTER (WHERE name = 'user_signed_up') AS neue,
       COUNT(*) FILTER (WHERE name = 'user_signed_up'
                          AND props->>'invite_id' IS NOT NULL) AS neue_geworben,
       COUNT(*) FILTER (WHERE name = 'session_started') AS sessions,
       COUNT(*) FILTER (WHERE name = 'title_rated') AS bewertungen,
       COUNT(*) FILTER (WHERE name = 'invite_sent') AS einladungen
     FROM analytics_events WHERE ts >= ${FS} AND ts < ${FE}`, p
  );

  metrics.matched_sessions_week = basisDa('session_started')
    ? ganz(z.matched) : ohneBasis('matched_sessions_week', 'session_started');
  metrics.new_users_week = basisDa('user_signed_up')
    ? ganz(z.neue) : ohneBasis('new_users_week', 'user_signed_up');
  metrics.invited_share = quote(z.neue_geworben, metrics.new_users_week);
  if (metrics.invited_share == null && !gruende.new_users_week) {
    gruende.invited_share = 'keine Neuanmeldungen im Zeitraum';
  }

  /* ---- cac: Spend aus Konfigtabelle / organische Neuanmeldungen ---- */
  const { rows: spend } = await pool.query(
    `SELECT amount_eur FROM marketing_spend WHERE week = $1::date`, [from]
  );
  if (!spend.length) {
    metrics.cac = null;
    gruende.cac = 'Konfigtabelle marketing_spend hat keine Zeile fuer diese Woche';
  } else {
    const organisch = Number(z.neue) - Number(z.neue_geworben);
    metrics.cac = quote(spend[0].amount_eur, organisch);
    if (metrics.cac == null) gruende.cac = 'keine organischen Neuanmeldungen im Zeitraum';
  }

  /* ---- Aktivierung (Kohorte Vorwoche): innerhalb 24 h nach Anmeldung an
     einem match_completed beteiligt (beteiligt = eigene Ereignisse in der
     betreffenden Session) ---- */
  const { rows: [akt] } = await pool.query(
    `WITH kohorte AS (
       SELECT user_id, MIN(ts) AS ts FROM analytics_events
        WHERE name = 'user_signed_up' AND user_id IS NOT NULL
          AND ts >= ${VS} AND ts < ${VE}
        GROUP BY user_id
     )
     SELECT COUNT(*) AS gesamt,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM analytics_events m
               WHERE m.name = 'match_completed'
                 AND m.ts >= k.ts AND m.ts < k.ts + interval '24 hours'
                 AND EXISTS (SELECT 1 FROM analytics_events b
                              WHERE b.session_id = m.session_id AND b.user_id = k.user_id)
            )) AS aktiviert
       FROM kohorte k`, [from] // nur $1: Vorwochenfenster haengt allein an `from`
  );
  if (!basisDa('session_started')) {
    metrics.activation_rate = ohneBasis('activation_rate', 'session_started');
  } else {
    metrics.activation_rate = quote(akt.aktiviert, akt.gesamt);
    if (metrics.activation_rate == null) gruende.activation_rate = 'keine Anmeldekohorte in der Vorwoche';
  }

  /* ---- Median Minuten Anmeldung -> erster eigener Match (Kohorte Vorwoche,
     nur wer ihn erreicht hat) ---- */
  const { rows: [ttfm] } = await pool.query(
    `WITH kohorte AS (
       SELECT user_id, MIN(ts) AS ts FROM analytics_events
        WHERE name = 'user_signed_up' AND user_id IS NOT NULL
          AND ts >= ${VS} AND ts < ${VE}
        GROUP BY user_id
     ), erreicht AS (
       SELECT k.user_id, k.ts AS signup_ts, MIN(m.ts) AS match_ts
         FROM kohorte k
         JOIN analytics_events b ON b.user_id = k.user_id AND b.session_id IS NOT NULL
         JOIN analytics_events m ON m.session_id = b.session_id
              AND m.name = 'match_completed' AND m.ts >= k.ts
        GROUP BY k.user_id, k.ts
     )
     SELECT COUNT(*) AS n,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (match_ts - signup_ts)) / 60.0) AS median_min
       FROM erreicht`, [from]
  );
  metrics.time_to_first_match = Number(ttfm.n) > 0 ? rund(ttfm.median_min) : null;
  if (metrics.time_to_first_match == null) {
    gruende.time_to_first_match = 'niemand aus der Vorwochen-Kohorte hat einen Match erreicht';
  }

  /* ---- Gast -> Konto binnen 14 Tagen (Gaeste der Vorwoche) ---- */
  const { rows: [gast] } = await pool.query(
    `WITH gaeste AS (
       SELECT anon_id, MIN(ts) AS ts FROM analytics_events
        WHERE name = 'invite_accepted' AND (props->>'guest')::boolean
          AND ts >= ${VS} AND ts < ${VE}
        GROUP BY anon_id
     )
     SELECT COUNT(*) AS gesamt,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM analytics_events s
               WHERE s.name = 'user_signed_up' AND s.anon_id = g.anon_id
                 AND s.ts >= g.ts AND s.ts < g.ts + interval '14 days'
            )) AS konvertiert
       FROM gaeste g`, [from]
  );
  metrics.guest_signup_rate = quote(gast.konvertiert, gast.gesamt);
  if (metrics.guest_signup_rate == null) gruende.guest_signup_rate = 'keine Gast-Teilnahmen in der Vorwoche';

  /* ---- Nutzung: dau/wau/mau ueber anon_id + app_opened ---- */
  if (!basisDa('app_opened')) {
    metrics.dau = ohneBasis('dau', 'app_opened');
    metrics.wau = ohneBasis('wau', 'app_opened');
    metrics.mau = ohneBasis('mau', 'app_opened');
  } else {
    const { rows: [nutzung] } = await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(n), 0) FROM (
            SELECT COUNT(DISTINCT anon_id) AS n FROM analytics_events
             WHERE name = 'app_opened' AND ts >= ${FS} AND ts < ${FE}
             GROUP BY (ts AT TIME ZONE '${TZ}')::date) t) AS tagessumme,
         (SELECT COUNT(DISTINCT anon_id) FROM analytics_events
           WHERE name = 'app_opened' AND ts >= ${FS} AND ts < ${FE}) AS wau,
         (SELECT COUNT(DISTINCT anon_id) FROM analytics_events
           WHERE name = 'app_opened'
             AND ts >= ${FE} - interval '30 days' AND ts < ${FE}) AS mau`, p
    );
    metrics.dau = ganz(Number(nutzung.tagessumme) / Number(fenster.tage));
    metrics.wau = ganz(nutzung.wau);
    metrics.mau = ganz(nutzung.mau);
  }

  /* ---- Gruppen: existieren nicht als Entitaet -> bewusst null ---- */
  metrics.sessions_per_group_month = null;
  metrics.group_retention_m1 = null;
  metrics.active_groups = null;
  gruende.sessions_per_group_month = 'Gruppen existieren im Datenmodell nicht (group_id immer null)';
  gruende.group_retention_m1 = gruende.sessions_per_group_month;
  gruende.active_groups = gruende.sessions_per_group_month;

  /* ---- Session-Groesse: je Session der letzten 30 Tage das Maximum des
     mitgeschriebenen participant_count ---- */
  const { rows: [gr] } = await pool.query(
    `WITH sess AS (
       SELECT DISTINCT session_id FROM analytics_events
        WHERE name = 'session_started' AND session_id IS NOT NULL
          AND ts >= ${FE1} - interval '30 days' AND ts < ${FE1}
     ), groesse AS (
       SELECT s.session_id, MAX((e.props->>'participant_count')::int) AS n
         FROM sess s JOIN analytics_events e ON e.session_id = s.session_id
        WHERE e.props ? 'participant_count'
        GROUP BY s.session_id
     )
     SELECT COUNT(*) AS anzahl, AVG(n) AS mittel FROM groesse`, [to]
  );
  metrics.avg_group_size = Number(gr.anzahl) > 0 ? rund(gr.mittel) : null;
  if (metrics.avg_group_size == null) gruende.avg_group_size = 'keine Sessions in den letzten 30 Tagen';

  metrics.swipes_per_session = quote(z.bewertungen, z.sessions);
  if (metrics.swipes_per_session == null) gruende.swipes_per_session = 'keine Sessions im Zeitraum';
  metrics.invites_per_user = quote(z.einladungen, metrics.wau);
  if (metrics.invites_per_user == null) {
    gruende.invites_per_user = gruende.wau ? 'WAU fehlt (siehe wau)' : 'WAU ist 0';
  }

  /* ---- Annahmequote: Einladungen, die IM FENSTER versendet wurden;
     Annahmen zaehlen bis 14 Tage nach dem Versand ---- */
  const { rows: [ann] } = await pool.query(
    `WITH versendet AS (
       SELECT props->>'invite_id' AS invite_id, ts FROM analytics_events
        WHERE name = 'invite_sent' AND ts >= ${FS} AND ts < ${FE}
     )
     SELECT (SELECT COUNT(*) FROM versendet) AS gesendet,
            (SELECT COUNT(*) FROM analytics_events a JOIN versendet v
                ON v.invite_id = a.props->>'invite_id'
              WHERE a.name = 'invite_accepted'
                AND a.ts >= v.ts AND a.ts < v.ts + interval '14 days') AS angenommen`, p
  );
  metrics.invite_accept_rate = quote(ann.angenommen, ann.gesendet);
  if (metrics.invite_accept_rate == null) gruende.invite_accept_rate = 'keine im Fenster versendeten Einladungen';

  /* ---- Median Tage Anmeldung -> ERSTE eigene Einladung (Nutzer, deren
     erste Einladung im Fenster liegt) ---- */
  const { rows: [zyk] } = await pool.query(
    `WITH erste_einladung AS (
       SELECT user_id, MIN(ts) AS ts FROM analytics_events
        WHERE name = 'invite_sent' AND user_id IS NOT NULL
        GROUP BY user_id
       HAVING MIN(ts) >= ${FS} AND MIN(ts) < ${FE}
     ), mit_signup AS (
       SELECT e.ts AS invite_ts,
              (SELECT MIN(s.ts) FROM analytics_events s
                WHERE s.name = 'user_signed_up' AND s.user_id = e.user_id) AS signup_ts
         FROM erste_einladung e
     )
     SELECT COUNT(*) AS n,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (invite_ts - signup_ts)) / 86400.0) AS median_tage
       FROM mit_signup WHERE signup_ts IS NOT NULL`, p
  );
  metrics.cycle_time_days = Number(zyk.n) > 0 ? rund(zyk.median_tage) : null;
  if (metrics.cycle_time_days == null) gruende.cycle_time_days = 'keine erste Einladung eines Nutzers im Zeitraum';

  /* ---- Retention d1/d7/d30 ueber anon_id der Anmeldung.
     Kohorten so alt, dass das jeweilige Fenster vollstaendig ist:
     d1/d7 = Vorwoche der Berichtswoche, d30 = 5 Wochen davor. ---- */
  async function retention(vonTage, bisTage, tagVon, tagBis) {
    const { rows: [r] } = await pool.query(
      `WITH kohorte AS (
         SELECT anon_id, MIN(ts) AS ts FROM analytics_events
          WHERE name = 'user_signed_up'
            AND ts >= (($1::date - ${vonTage})::timestamp AT TIME ZONE '${TZ}')
            AND ts <  (($1::date - ${bisTage})::timestamp AT TIME ZONE '${TZ}')
          GROUP BY anon_id
       )
       SELECT COUNT(*) AS gesamt,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM analytics_events a
                 WHERE a.name = 'app_opened' AND a.anon_id = k.anon_id
                   AND ((a.ts AT TIME ZONE '${TZ}')::date
                        - (k.ts AT TIME ZONE '${TZ}')::date) BETWEEN ${tagVon} AND ${tagBis}
              )) AS zurueck
         FROM kohorte k`, [from]
    );
    return quote(r.zurueck, r.gesamt);
  }
  if (!basisDa('app_opened')) {
    metrics.d1 = ohneBasis('d1', 'app_opened');
    metrics.d7 = ohneBasis('d7', 'app_opened');
    metrics.d30 = ohneBasis('d30', 'app_opened');
  } else {
    metrics.d1 = await retention(7, 0, 1, 1);
    metrics.d7 = await retention(7, 0, 5, 7);
    metrics.d30 = await retention(35, 28, 25, 30);
    if (metrics.d1 == null) gruende.d1 = 'keine Anmeldekohorte in der Vorwoche';
    if (metrics.d7 == null) gruende.d7 = 'keine Anmeldekohorte in der Vorwoche';
    if (metrics.d30 == null) gruende.d30 = 'keine Anmeldekohorte vor 5 Wochen';
  }

  /* ---- Monetarisierung: ehrliche Nullen, solange es die Produkte nicht
     gibt (Abos, Affiliate-Programme und Werbung existieren noch nicht) ---- */
  const { rows: [abo] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE name = 'subscription_started')
            - COUNT(*) FILTER (WHERE name = 'subscription_cancelled') AS aktive,
            COALESCE(SUM(CASE WHEN name = 'subscription_started' THEN (props->>'mrr_eur')::numeric
                              WHEN name = 'subscription_cancelled' THEN -(props->>'mrr_eur')::numeric
                         END), 0) AS mrr
       FROM analytics_events
      WHERE name IN ('subscription_started', 'subscription_cancelled') AND ts < ${FE1}`, [to]
  );
  metrics.paying_users = Math.max(0, ganz(abo.aktive));
  metrics.mrr = Math.max(0, rund(abo.mrr));

  const { rows: [aff] } = await pool.query(
    `SELECT COALESCE(SUM((props->>'revenue_eur')::numeric), 0) AS summe
       FROM analytics_events
      WHERE name = 'affiliate_conversion'
        AND ts >= ${FE1} - interval '30 days' AND ts < ${FE1}`, [to]
  );
  metrics.affiliate_revenue_month = rund(aff.summe);
  metrics.ad_revenue_month = 0; // keine Werbe-Anbindung -- laut Definition 0

  /* ---- Profilierte Nutzer: >= 20 title_rated insgesamt (bis Fensterende) ---- */
  if (!basisDa('title_rated')) {
    metrics.profiled_users = ohneBasis('profiled_users', 'title_rated');
  } else {
    const { rows: [prof] } = await pool.query(
      `SELECT COUNT(*) AS n FROM (
         SELECT user_id FROM analytics_events
          WHERE name = 'title_rated' AND user_id IS NOT NULL AND ts < ${FE1}
          GROUP BY user_id HAVING COUNT(*) >= 20) t`, [to]
    );
    metrics.profiled_users = ganz(prof.n);
  }

  /* ---- B2B aus der Konfigtabelle ---- */
  const { rows: [b2b] } = await pool.query(
    `SELECT COALESCE(SUM(value_eur) FILTER (WHERE status = 'offen'), 0) AS pipeline,
            COALESCE(SUM(value_eur) FILTER (WHERE status = 'gewonnen'), 0) AS arr
       FROM b2b_deals`
  );
  metrics.b2b_pipeline = rund(b2b.pipeline);
  metrics.b2b_arr = rund(b2b.arr);

  const snapshot = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    period: { from, to },
    metrics,
  };
  return { snapshot, gruende };
}

/* ---- Wochen-Arithmetik (Europe/Berlin, in SQL statt JS-Datumsrechnung) ---- */

// Montag..Sonntag der Woche, die `wochenZurueck` abgeschlossene Wochen
// zurueckliegt (1 = letzte abgeschlossene Woche).
export async function abgeschlosseneWoche(wochenZurueck = 1) {
  const { rows: [r] } = await pool.query(
    `SELECT to_char(montag - $1::int * 7, 'YYYY-MM-DD') AS von,
            to_char(montag - $1::int * 7 + 6, 'YYYY-MM-DD') AS bis
       FROM (SELECT (now() AT TIME ZONE '${TZ}')::date
                    - (EXTRACT(ISODOW FROM now() AT TIME ZONE '${TZ}')::int - 1) AS montag) w`,
    [wochenZurueck]
  );
  return { from: r.von, to: r.bis };
}

// Snapshot versioniert ablegen -- nie ueberschreiben (siehe schema.sql).
export async function snapshotSpeichern(snapshot) {
  await pool.query(
    `INSERT INTO kpi_snapshots (week_start, version, payload)
     VALUES ($1::date,
             COALESCE((SELECT MAX(version) + 1 FROM kpi_snapshots WHERE week_start = $1::date), 1),
             $2)`,
    [snapshot.period.from, JSON.stringify(snapshot)]
  );
}

/* ---- Woechentlicher Job: montags ab 06:00 Europe/Berlin den Snapshot der
   Vorwoche ablegen. Laeuft als Wache im Prozess (wie starteSicherung & Co.):
   alle 30 Minuten pruefen, ob der Snapshot der letzten abgeschlossenen Woche
   fehlt UND die Woche seit Montag 06:00 "reif" ist -- so holt ein Neustart
   oder ein verpasster Montag die Woche von selbst nach, und vor 06:00 am
   Montag passiert nichts. ---- */
const PRUEF_INTERVALL_MS = 30 * 60 * 1000;

async function kpiLauf() {
  const { rows: [reif] } = await pool.query(
    `SELECT (now() AT TIME ZONE '${TZ}')
            >= ((now() AT TIME ZONE '${TZ}')::date
                - (EXTRACT(ISODOW FROM now() AT TIME ZONE '${TZ}')::int - 1))::timestamp
               + interval '6 hours' AS reif`
  );
  if (!reif.reif) return;
  const woche = await abgeschlosseneWoche(1);
  const { rows: schon } = await pool.query(
    'SELECT 1 FROM kpi_snapshots WHERE week_start = $1::date LIMIT 1', [woche.from]
  );
  if (schon.length) return;
  const { snapshot } = await buildSnapshot(woche.from, woche.to);
  await snapshotSpeichern(snapshot);
  console.log(`KPI-Snapshot fuer Woche ${woche.from} abgelegt.`);
}

export function starteKpiSnapshot() {
  const lauf = () => kpiLauf().catch((err) => console.error('KPI-Snapshot fehlgeschlagen:', err.message));
  // Kurz nach dem Start einmal pruefen (Migration ist bis dahin gelaufen),
  // danach im halben Stundentakt.
  setTimeout(lauf, 60 * 1000);
  setInterval(lauf, PRUEF_INTERVALL_MS);
}

/* ---- Aufbewahrung der Einzelereignisse ----
   Die Datenschutzerklaerung (Abschnitt 10) sagt zu, dass Einzelereignisse
   nach 14 Monaten verschwinden -- lang genug fuer den Vergleich mit dem
   Vorjahresmonat, danach ohne Nutzen. Die Wochen-Snapshots bleiben: Sie
   enthalten nur noch Summen und Durchschnitte ohne jede Kennung.

   Taeglich wie die anderen Aufraeumlaeufe, nur zeitversetzt gestartet, damit
   beim Hochfahren nicht mehrere gleichzeitig auf der Datenbank liegen. */
export const EREIGNIS_AUFBEWAHRUNG_MONATE = 14;

export function starteKpiAufraeumen() {
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    pool.query(
      `DELETE FROM analytics_events
        WHERE ts < now() - ($1 || ' months')::interval`,
      [String(EREIGNIS_AUFBEWAHRUNG_MONATE)]
    )
      .then(({ rowCount }) => {
        if (rowCount) console.log(`[kpi] ${rowCount} Ereignis(se) nach ${EREIGNIS_AUFBEWAHRUNG_MONATE} Monaten geloescht.`);
      })
      .catch((err) => console.error('[kpi] Aufraeumen fehlgeschlagen:', err.message));
  };
  setTimeout(lauf, 90_000);
  setInterval(lauf, EIN_TAG);
}
