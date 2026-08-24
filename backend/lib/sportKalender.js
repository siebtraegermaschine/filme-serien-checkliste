/*
 * Spielplan als Kalender-Abo (24.08.2026): GET /kalender/<vereins-slug>.ics
 * liefert die Spiele eines Vereins als ICS-Feed. Der Witz gegenueber einem
 * einmaligen Download: Kalender-Apps ABONNIEREN die URL (webcal://) und
 * aktualisieren sich danach von selbst -- Verlegungen und Senderwechsel
 * kommen mit dem naechsten Kalender-Refresh an, ohne dass jemand die App
 * oeffnet. Sender stehen mit im Termin-Titel ("wo laeuft's" ist der Kern
 * der Seite), Details und der Link zur Spielseite in der Beschreibung.
 *
 * Zeiten als UTC (Z-Format): jede Kalender-App rechnet selbst in die
 * Ortszeit um, ein VTIMEZONE-Block entfaellt.
 */
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { sportKontext, spielPfad } from './seoSport.js';

// RFC-5545-Escaping fuer Textfelder: Backslash, Semikolon, Komma, Zeilen.
export function icsText(t) {
  return String(t)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Zeilen ueber 75 Oktetten werden gefaltet (CRLF + Leerzeichen) -- manche
// Kalender-Parser bestehen darauf. Geschnitten wird nach BYTES, nicht
// Zeichen; damit ein Umlaut nicht mitten im UTF-8-Byte zerfaellt, wird an
// Fortsetzungsbytes (0b10xxxxxx) zurueckgewichen.
export function icsZeile(zeile) {
  const bytes = Buffer.from(zeile, 'utf8');
  if (bytes.length <= 75) return zeile;
  const teile = [];
  let start = 0;
  while (start < bytes.length) {
    let ende = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (ende > start && ende < bytes.length && (bytes[ende] & 0xc0) === 0x80) ende--;
    teile.push(bytes.slice(start, ende).toString('utf8'));
    start = ende;
  }
  return teile.join('\r\n ');
}

function icsZeit(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/* Der Kalender als Text -- reine Funktion, testbar ohne Datenbank.
   spiele: Zeilen aus sport_matches; sender/wettbewerbe: sport_meta. */
export function kalenderIcs({ team, spiele, sender, wettbewerbe, basis, marke, jetzt = new Date() }) {
  const stamp = icsZeit(jetzt);
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${icsText(marke)}//Spielplan//DE`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`⚽ ${team} – Spielplan`)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Hinweis an die Kalender-App, wie oft sich ein Neuladen lohnt --
    // Anstosszeiten und Sender aendern sich hoechstens tageweise.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];
  for (const m of spiele) {
    const senderNamen = [...new Set((Array.isArray(m.tv) ? m.tv : [])
      .map((b) => ((sender || {})[b.s] || { name: b.s }).name))];
    const comp = ((wettbewerbe || {})[m.wettbewerb] || {}).name || m.wettbewerb;
    const titel = `⚽ ${m.heim} – ${m.gast}${senderNamen.length ? ` · ${senderNamen.join(', ')}` : ''}`;
    const beschreibung = [
      comp + (m.runde ? `, ${m.runde}` : ''),
      senderNamen.length ? `Übertragung: ${senderNamen.join(' und ')}` : 'Sender noch offen',
      basis + spielPfad(m),
    ].join('\n');
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:spiel-${m.external_id}@${basis.replace(/^https?:\/\//, '')}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsZeit(m.anstoss)}`,
      'DURATION:PT2H',
      `SUMMARY:${icsText(titel)}`,
      `DESCRIPTION:${icsText(beschreibung)}`,
      `URL:${basis}${spielPfad(m)}`,
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.map(icsZeile).join('\r\n') + '\r\n';
}

/* Laden + Rendern fuer die Route: Team ueber den Slug finden (gleiche
   Zuordnung wie die /verein/-SEO-Seiten), dann juengste Vergangenheit und
   alles Kommende. null, wenn der Slug kein Team des Spielplans ist. */
export async function ladeKalender(slug) {
  const { rows: teamRows } = await pool.query(
    'SELECT DISTINCT heim AS name FROM sport_matches UNION SELECT DISTINCT gast FROM sport_matches');
  const name = teamRows.map((r) => r.name).find((n) => slugify(n) === slug);
  if (!name) return null;
  const [{ rows: spiele }, { rows: metaRows }] = await Promise.all([
    pool.query(
      `SELECT external_id, wettbewerb, runde, anstoss, heim, gast, tv FROM sport_matches
        WHERE (heim = $1 OR gast = $1) AND anstoss > now() - interval '7 days'
        ORDER BY anstoss`, [name]),
    pool.query('SELECT key, value FROM sport_meta'),
  ]);
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
  const ctx = sportKontext();
  return kalenderIcs({
    team: name, spiele,
    sender: meta.sender || {}, wettbewerbe: meta.wettbewerbe || {},
    basis: ctx.basis, marke: ctx.marke || 'MovieMatch',
  });
}
