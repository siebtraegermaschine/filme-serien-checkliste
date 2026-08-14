/* npm run kpi:backfill -- rekonstruiert historische KPI-Ereignisse aus den
   vorhandenen Tabellen, damit GET /api/kpi/rebuild fuer vergangene Wochen
   nicht nur Nullen liefert. Einmal nach dem Deploy ausfuehren, danach
   uebernimmt die Live-Erfassung.
 *
 * Rekonstruierbar sind:
 *   user_signed_up   aus users.created_at (invite_id unbekannt -- der Token-
 *                    Hash wurde bei der Registrierung nie gespeichert; als
 *                    Ersatz traegt props.invite_id 'backfill:<werber-id>',
 *                    damit invited_share stimmt)
 *   invite_sent      aus user_link_invites.created_at
 *   invite_accepted  aus user_link_invite_uses.accepted_at (immer mit Konto,
 *                    guest=false -- Gast-Teilnahmen wurden nie festgehalten)
 *   title_rated      aus user_progress (nur der LETZTE Stand je Titel hat
 *                    einen Zeitstempel -- updated_at ist eine Naeherung)
 *   session_started / title_rated / match_completed aus den Movie-Night-
 *                    Tabellen (Runden verfallen nach 48 h, es existiert also
 *                    nur die juengste Vergangenheit)
 *
 * NICHT rekonstruierbar: app_opened (der Trichter metrik_tage traegt bewusst
 * keine Kennungen) -- dau/wau/mau und Retention bleiben fuer die
 * Vergangenheit null.
 *
 * Idempotent: Alle Zeilen tragen props.backfilled=true und anon_id
 * 'backfill:...'; ein erneuter Lauf loescht sie zuerst und spielt sie neu
 * ein. Live erfasste Ereignisse werden nie angefasst. */
import { pool } from '../db/pool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const { rowCount: alt } = await client.query(
    `DELETE FROM analytics_events WHERE (props->>'backfilled')::boolean`
  );

  await client.query(`
    INSERT INTO analytics_events (name, ts, user_id, anon_id, props)
    SELECT 'user_signed_up', u.created_at, u.id::text, 'backfill:u' || u.id,
           jsonb_build_object(
             'source', CASE WHEN u.invited_by_user_id IS NULL THEN 'organic' ELSE 'referral' END,
             'invite_id', CASE WHEN u.invited_by_user_id IS NULL THEN NULL
                               ELSE 'backfill:' || u.invited_by_user_id END,
             'was_guest', false, 'backfilled', true)
      FROM users u`);

  await client.query(`
    INSERT INTO analytics_events (name, ts, user_id, anon_id, props)
    SELECT 'invite_sent', i.created_at, i.inviter_id::text, 'backfill:u' || i.inviter_id,
           jsonb_build_object('invite_id', i.token_hash, 'channel', i.kind, 'backfilled', true)
      FROM user_link_invites i`);

  await client.query(`
    INSERT INTO analytics_events (name, ts, user_id, anon_id, props)
    SELECT 'invite_accepted', n.accepted_at, n.user_id::text, 'backfill:u' || n.user_id,
           jsonb_build_object('invite_id', n.token_hash, 'guest', false, 'backfilled', true)
      FROM user_link_invite_uses n`);

  await client.query(`
    INSERT INTO analytics_events (name, ts, user_id, anon_id, props)
    SELECT 'title_rated', p.updated_at, p.user_id::text, 'backfill:u' || p.user_id,
           jsonb_build_object('title_id', p.title_id,
             'verdict', CASE WHEN p.seen THEN 'seen'
                             WHEN p.watchlist THEN 'watchlist'
                             ELSE 'stars' END,
             'backfilled', true)
      FROM user_progress p
     WHERE p.seen OR p.watchlist OR p.rating IS NOT NULL`);

  await client.query(`
    INSERT INTO analytics_events (name, ts, user_id, anon_id, session_id, props)
    SELECT 'session_started', r.created_at, r.ersteller_user_id::text,
           COALESCE('backfill:u' || r.ersteller_user_id, 'backfill:mn'), r.id::text,
           jsonb_build_object('participant_count', 1, 'backfilled', true)
      FROM movie_night_runden r`);

  await client.query(`
    INSERT INTO analytics_events (name, ts, anon_id, session_id, props)
    SELECT 'title_rated', s.abgegeben_at, 'backfill:mn:' || left(s.teilnehmer, 16), s.runde_id::text,
           jsonb_build_object('title_id', s.title_id,
             'verdict', CASE WHEN s.stimme THEN 'yes' ELSE 'no' END,
             'participant_count',
               (SELECT COUNT(DISTINCT t.teilnehmer) FROM movie_night_stimmen t
                 WHERE t.runde_id = s.runde_id),
             'backfilled', true)
      FROM movie_night_stimmen s`);

  // Match: Titel, dem ALLE Teilnehmenden einer Runde zugestimmt haben, bei
  // mindestens zwei Teilnehmenden. Zeitpunkt = letzte der zugehoerigen
  // Ja-Stimmen (Naeherung, wie alles hier).
  await client.query(`
    INSERT INTO analytics_events (name, ts, anon_id, session_id, props)
    SELECT 'match_completed', m.ts, 'backfill:mn', m.runde_id::text,
           jsonb_build_object('participant_count', m.teilnehmer, 'title_id', m.title_id, 'backfilled', true)
      FROM (
        SELECT s.runde_id, s.title_id, MAX(s.abgegeben_at) AS ts,
               (SELECT COUNT(DISTINCT t.teilnehmer) FROM movie_night_stimmen t
                 WHERE t.runde_id = s.runde_id) AS teilnehmer,
               ROW_NUMBER() OVER (PARTITION BY s.runde_id ORDER BY s.title_id) AS nr
          FROM movie_night_stimmen s
         WHERE s.stimme
         GROUP BY s.runde_id, s.title_id
        HAVING COUNT(DISTINCT s.teilnehmer)
               = (SELECT COUNT(DISTINCT t.teilnehmer) FROM movie_night_stimmen t
                   WHERE t.runde_id = s.runde_id)
      ) m
     WHERE m.teilnehmer >= 2 AND m.nr = 1`);

  const { rows: [neu] } = await client.query(
    `SELECT COUNT(*) AS n FROM analytics_events WHERE (props->>'backfilled')::boolean`
  );
  await client.query('COMMIT');
  console.log(`Backfill fertig: ${alt} alte Zeilen ersetzt, ${neu.n} Ereignisse rekonstruiert.`);
  console.log('Naechster Schritt: GET /api/kpi/rebuild?weeks=12&force=1 (mit x-kpi-token).');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Backfill fehlgeschlagen, nichts geaendert:', err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
