/*
 * Spiel-Erinnerungen per Web-Push (24.08.2026). Jedes Geraet waehlt selbst,
 * WANN es erinnert werden will -- eine oder mehrere Zeitstufen:
 *
 *   morgens8  8:00 Uhr am Spieltag ("Heute Abend spielt ...")
 *   vor120    2 Stunden vor Anstoss
 *   vor60     1 Stunde vor Anstoss
 *   vor30     30 Minuten vor Anstoss
 *   vor5      5 Minuten vor Anstoss
 *   anstoss   zum Anpfiff
 *
 * Standard ist NICHTS: Wer nichts auswaehlt, bekommt nichts (siehe
 * schema.sql, push_abos.arten).
 *
 * BEWUSST KEIN Toralarm: Der Live-Ticker holt den Stand nur alle 90 Sekunden
 * von OpenLigaDB (lib/sportLive.js) -- ein "Tor!" waere damit nicht ehrlich
 * live. Aufstellungen liegen nur als Prognose vor. Beides kann spaeter eine
 * weitere Zeitstufe bzw. Art werden, das Schema traegt es.
 *
 * Ein Minuten-Tick sucht faellige Paare aus Abo und Spiel. Doppelte
 * verhindert push_versand (eine Zeile je Abo + Spiel + Zeitstufe, eingefuegt
 * VOR dem Senden): Auch ein Neustart mitten im Fenster schickt nichts zweimal.
 */
import { pool } from '../db/pool.js';
import { sendePush, ladeVapid } from './webpush.js';

const TAKT_MS = 60_000;
// Wie lange eine faellige Erinnerung noch verschickt werden darf. Ein Tick
// dauert eine Minute; 10 Minuten Kulanz fangen Aussetzer und langsame Laeufe
// ab, ohne dass eine "in 5 Minuten"-Meldung erst nach dem Anpfiff eintrudelt.
const KULANZ_MS = 10 * 60_000;

export const ARTEN = ['morgens8', 'vor120', 'vor60', 'vor30', 'vor5', 'anstoss'];
const VORLAUF_MIN = { vor120: 120, vor60: 60, vor30: 30, vor5: 5, anstoss: 0 };

const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const tagKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });

/* Wann genau eine Zeitstufe faellig ist -- als Zeitpunkt. Reine Funktion,
   damit sie ohne Datenbank testbar bleibt.
   morgens8: 8:00 Uhr Berliner Zeit AM TAG DES SPIELS. Der Sommer-/Winterzeit
   wegen nicht "Anstoss minus X", sondern aus dem oertlichen Kalendertag
   zurueckgerechnet: Die Differenz zwischen 8 Uhr und dem Anstoss ergibt sich
   aus der oertlichen Uhrzeit des Anstosses. */
export function zielZeitpunkt(art, anstoss) {
  const ko = new Date(anstoss);
  if (art === 'morgens8') {
    // Oertliche Uhrzeit des Anstosses in Minuten seit Mitternacht.
    const teile = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(ko);
    const stunde = Number(teile.find((p) => p.type === 'hour').value);
    const minute = Number(teile.find((p) => p.type === 'minute').value);
    const seitMitternacht = stunde * 60 + minute;
    // Anstoss vor 8 Uhr: eine Morgenmeldung waere danach -- die faellt aus.
    if (seitMitternacht <= 8 * 60) return null;
    return new Date(ko.getTime() - (seitMitternacht - 8 * 60) * 60_000);
  }
  const min = VORLAUF_MIN[art];
  if (min === undefined) return null;
  return new Date(ko.getTime() - min * 60_000);
}

/* Ist diese Zeitstufe jetzt zu verschicken? Nur INNERHALB des Kulanzfensters
   nach dem Zielzeitpunkt -- eine Stufe, deren Moment lange vorbei ist (Abo
   erst kurz vor Anpfiff eingerichtet), wird uebersprungen statt verspaetet
   nachgereicht. */
export function istFaellig(art, anstoss, jetzt = new Date()) {
  const ziel = zielZeitpunkt(art, anstoss);
  if (!ziel) return false;
  const t = jetzt.getTime();
  return t >= ziel.getTime() && t < ziel.getTime() + KULANZ_MS;
}

/* Titel und Text der Erinnerung. Der Vorlauf steht vorne im Text -- beim
   Blick auf den Sperrbildschirm ist "In 5 Minuten" die eigentliche Nachricht,
   nicht die Uhrzeit. */
export function erinnerungsText(spiel, art, sender = {}, wettbewerbe = {}) {
  const namen = [...new Set((Array.isArray(spiel.tv) ? spiel.tv : [])
    .map((b) => (sender[b.s] || { name: b.s }).name))];
  const frei = (Array.isArray(spiel.tv) ? spiel.tv : []).some((b) => (sender[b.s] || {}).frei);
  const comp = (wettbewerbe[spiel.wettbewerb] || {}).name || spiel.wettbewerb;
  const zeit = uhrzeit.format(spiel.anstoss);
  const vorlauf = {
    morgens8: `Heute ${zeit} Uhr`,
    vor120: `In 2 Stunden (${zeit} Uhr)`,
    vor60: `In 1 Stunde (${zeit} Uhr)`,
    vor30: `In 30 Minuten (${zeit} Uhr)`,
    vor5: `In 5 Minuten (${zeit} Uhr)`,
    anstoss: 'Anpfiff!',
  }[art] || `${zeit} Uhr`;
  return {
    titel: `⚽ ${spiel.heim} – ${spiel.gast}`,
    text: `${vorlauf} · ${comp}` +
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
    // Kandidaten: Abos mit mindestens einer Zeitstufe, dazu die Spiele ihrer
    // Vereine im Fenster von 26 Stunden voraus (deckt 'morgens8' auch fuer
    // ein Abendspiel ab) bis 15 Minuten nach Anstoss (fuer 'anstoss').
    const { rows } = await pool.query(
      `SELECT a.id AS abo_id, a.endpoint, a.p256dh, a.auth, a.arten,
              m.external_id, m.wettbewerb, m.anstoss, m.heim, m.gast, m.tv
         FROM push_abos a
         JOIN sport_matches m
           ON (m.heim = ANY(a.vereine) OR m.gast = ANY(a.vereine))
        WHERE COALESCE(array_length(a.arten, 1), 0) > 0
          AND m.anstoss > now() - interval '15 minutes'
          AND m.anstoss < now() + interval '26 hours'
        LIMIT 1000`);
    if (!rows.length) return;

    const { rows: metaRows } = await pool.query(
      `SELECT key, value FROM sport_meta WHERE key IN ('sender', 'wettbewerbe')`);
    const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const vapid = await ladeVapid(pool);
    const jetzt = new Date();

    for (const r of rows) {
      for (const art of r.arten) {
        if (!ARTEN.includes(art) || !istFaellig(art, r.anstoss, jetzt)) continue;
        // Erst vormerken, dann senden -- lieber eine im Fehlerfall
        // verschluckte Erinnerung als Doppelte bei jedem folgenden Tick.
        const { rowCount } = await pool.query(
          `INSERT INTO push_versand (abo_id, match_id, art) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`, [r.abo_id, r.external_id, art]);
        if (!rowCount) continue;
        const status = await sendePush(
          r, erinnerungsText(r, art, meta.sender || {}, meta.wettbewerbe || {}), vapid.privat);
        // 404/410: Abo beim Push-Dienst erloschen (Browser abbestellt/geloescht).
        if (status === 404 || status === 410) {
          await pool.query('DELETE FROM push_abos WHERE id = $1', [r.abo_id]);
          break;   // weitere Zeitstufen dieses Abos eruebrigen sich
        }
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
