/*
 * Spielbeginn-Erinnerungen per Web-Push (24.08.2026): Ein Minuten-Tick
 * schaut, welche Spiele der abonnierten Vereine in den naechsten 30 Minuten
 * anstossen, und schickt jedem Abo einmalig eine Nachricht -- Gegner,
 * Anstosszeit und Sender ("wo laeuft's" ist der Kern der Seite).
 *
 * BEWUSST NUR der Spielbeginn (Christian, 24.08.2026): Ein Toralarm waere
 * mit dem 90-Sekunden-Polling von lib/sportLive.js nicht ehrlich "live",
 * und Aufstellungen pflegen wir nur als Prognose. Beides kann spaeter als
 * weitere "art" dazukommen -- Schema und Versandweg sind darauf ausgelegt.
 *
 * Doppelte vermeidet push_versand (eine Zeile je Abo+Spiel+Art, Einfuegen
 * VOR dem Senden): Auch bei Neustart mitten im Fenster geht nichts doppelt.
 */
import { pool } from '../db/pool.js';
import { sendePush, ladeVapid } from './webpush.js';

const TAKT_MS = 60_000;
const VORLAUF = '30 minutes';

const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

/* Titel und Text der Erinnerung -- reine Funktion, testbar. Deutsch, wie der
   ganze Sport-Bereich (DE-only wegen der Senderrechte). */
export function erinnerungsText(spiel, sender = {}, wettbewerbe = {}) {
  const namen = [...new Set((Array.isArray(spiel.tv) ? spiel.tv : [])
    .map((b) => (sender[b.s] || { name: b.s }).name))];
  const frei = (Array.isArray(spiel.tv) ? spiel.tv : []).some((b) => (sender[b.s] || {}).frei);
  const comp = (wettbewerbe[spiel.wettbewerb] || {}).name || spiel.wettbewerb;
  return {
    titel: `⚽ ${spiel.heim} – ${spiel.gast}`,
    text: `Anstoß ${uhrzeit.format(spiel.anstoss)} Uhr (${comp})` +
      (namen.length ? ` · läuft bei ${namen.join(' und ')}` : ' · Sender noch offen') +
      (frei ? ' · Free-TV' : ''),
    url: '/sport',
  };
}

let laeuft = false;

async function tick() {
  if (laeuft) return;
  laeuft = true;
  try {
    // Faellige Paare Abo x Spiel: Verein spielt, Anstoss in <= 30 Minuten,
    // noch nicht erinnert. Ein Abo ohne 'spielbeginn' in arten bleibt aussen
    // vor (Vorgriff auf spaetere Benachrichtigungsarten).
    const { rows } = await pool.query(
      `SELECT a.id AS abo_id, a.endpoint, a.p256dh, a.auth,
              m.external_id, m.wettbewerb, m.anstoss, m.heim, m.gast, m.tv
         FROM push_abos a
         JOIN sport_matches m
           ON (m.heim = ANY(a.vereine) OR m.gast = ANY(a.vereine))
        WHERE 'spielbeginn' = ANY(a.arten)
          AND m.anstoss > now() AND m.anstoss <= now() + $1::interval
          AND NOT EXISTS (SELECT 1 FROM push_versand v
                           WHERE v.abo_id = a.id AND v.match_id = m.external_id
                             AND v.art = 'spielbeginn')
        LIMIT 500`, [VORLAUF]);
    if (!rows.length) return;

    const { rows: metaRows } = await pool.query(
      `SELECT key, value FROM sport_meta WHERE key IN ('sender', 'wettbewerbe')`);
    const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const vapid = await ladeVapid(pool);

    for (const r of rows) {
      // Erst vormerken, dann senden -- lieber eine im Fehlerfall verschluckte
      // Erinnerung als Doppelte bei jedem folgenden Tick.
      const { rowCount } = await pool.query(
        `INSERT INTO push_versand (abo_id, match_id, art) VALUES ($1, $2, 'spielbeginn')
         ON CONFLICT DO NOTHING`, [r.abo_id, r.external_id]);
      if (!rowCount) continue;
      const status = await sendePush(r, erinnerungsText(r, meta.sender || {}, meta.wettbewerbe || {}), vapid.privat);
      // 404/410: Abo beim Push-Dienst erloschen (Browser abbestellt/geloescht).
      if (status === 404 || status === 410) {
        await pool.query('DELETE FROM push_abos WHERE id = $1', [r.abo_id]);
      }
    }

    await pool.query(`DELETE FROM push_versand WHERE gesendet_at < now() - interval '7 days'`);
  } catch (err) {
    console.error('Sport-Push:', err.message);
  } finally {
    laeuft = false;
  }
}

export function starteSportPush() {
  setInterval(tick, TAKT_MS);
}
