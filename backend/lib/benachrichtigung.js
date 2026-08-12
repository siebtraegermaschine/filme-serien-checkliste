/*
 * Taeglicher Benachrichtigungs-Versand (Opt-in, users.benachrichtigung).
 *
 * Meldet je Person gesammelt in EINER Mail:
 *   - Watchlist-Titel, die seit kurzem bei ihren gewaehlten Streaming-
 *     Anbietern verfuegbar sind (streaming_cache.first_seen_at, Region der
 *     Person; ohne Anbieter-Auswahl zaehlt jeder Anbieter -- dieselbe Regel
 *     wie im Frontend-Filter).
 *   - Watchlist-Filme, die gerade im Kino anlaufen (cinema_cache.release_date
 *     der Region, die letzten Tage).
 *
 * `benachrichtigt` merkt jeden verschickten Treffer je Person/Titel/Art --
 * wer die Mail bekommt, bekommt denselben Titel nie zweimal gemeldet, auch
 * wenn er im Zeitfenster bleibt. Das Zeitfenster (FENSTER_TAGE) faengt den
 * Rotations-Rhythmus der Importe ab: kleinere Regionen werden nur alle paar
 * Tage aktualisiert, ihre Neuzugaenge sollen trotzdem gemeldet werden.
 *
 * Versand einmal taeglich am fruehen Abend (nach den Import-Ketten, siehe
 * streaming.yml/cinema.yml). Fehler je Person brechen den Lauf nicht ab.
 */
import { pool } from '../db/pool.js';
import { sendMail } from './mailer.js';
import { sprachWahl, regionWahl, sprachFeld } from './i18n.js';

const EIN_TAG = 24 * 60 * 60 * 1000;
const VERSAND_STUNDE_UTC = 18;   // nach Streaming-Rotation (~13 Uhr) und Kino-Kette (~17 Uhr)
const FENSTER_TAGE = 4;          // Rotationsgruppen laufen alle vier Tage
const BASIS_URL = process.env.PUBLIC_BASE_URL || 'https://movietaste.de';

/* Mailtexte je Oberflaechensprache der Person. Bewusst schlicht: Betreff,
   zwei Abschnitts-Ueberschriften, Fusszeile mit Abbestell-Hinweis. */
const TEXTE = {
  de: { betreff: (n) => `MovieMatch: ${n === 1 ? 'ein Watchlist-Titel ist' : n + ' Watchlist-Titel sind'} jetzt verfügbar`,
        stream: 'Neu bei deinen Streaming-Anbietern:', kino: 'Jetzt im Kino:',
        fuss: `Abbestellen: In der App unter Einstellungen die E-Mail-Benachrichtigung ausschalten.\n${BASIS_URL}` },
  en: { betreff: (n) => `MovieMatch: ${n === 1 ? 'a watchlist title is' : n + ' watchlist titles are'} now available`,
        stream: 'New on your streaming services:', kino: 'Now in cinemas:',
        fuss: `Unsubscribe: turn off email notifications under Settings in the app.\n${BASIS_URL}` },
  fr: { betreff: (n) => `MovieMatch : ${n === 1 ? 'un titre de ta watchlist est disponible' : n + ' titres de ta watchlist sont disponibles'}`,
        stream: 'Nouveau chez tes services de streaming :', kino: 'Maintenant au cinéma :',
        fuss: `Se désabonner : désactive les notifications par e-mail dans les réglages de l’app.\n${BASIS_URL}` },
  es: { betreff: (n) => `MovieMatch: ${n === 1 ? 'un título de tu watchlist ya está disponible' : n + ' títulos de tu watchlist ya están disponibles'}`,
        stream: 'Nuevo en tus servicios de streaming:', kino: 'Ahora en cines:',
        fuss: `Darse de baja: desactiva las notificaciones por correo en los ajustes de la app.\n${BASIS_URL}` },
  it: { betreff: (n) => `MovieMatch: ${n === 1 ? 'un titolo della tua watchlist è ora disponibile' : n + ' titoli della tua watchlist sono ora disponibili'}`,
        stream: 'Novità dai tuoi servizi di streaming:', kino: 'Ora al cinema:',
        fuss: `Disiscriviti: disattiva le notifiche e-mail nelle impostazioni dell’app.\n${BASIS_URL}` },
  nl: { betreff: (n) => `MovieMatch: ${n === 1 ? 'een watchlist-titel is nu beschikbaar' : n + ' watchlist-titels zijn nu beschikbaar'}`,
        stream: 'Nieuw bij je streamingdiensten:', kino: 'Nu in de bioscoop:',
        fuss: `Afmelden: zet e-mailmeldingen uit bij Instellingen in de app.\n${BASIS_URL}` },
};

async function personBenachrichtigen(person) {
  const region = regionWahl(person.region);
  const sprache = sprachWahl(person.sprache);
  const anbieter = Array.isArray(person.watch_provider_ids) && person.watch_provider_ids.length
    ? person.watch_provider_ids : null;

  // Watchlist-Titel, die in der Region der Person neu bei einem (gewaehlten)
  // Anbieter aufgetaucht sind. DISTINCT: derselbe Titel kann bei mehreren
  // Anbietern gleichzeitig neu sein.
  const { rows: stream } = await pool.query(
    `SELECT DISTINCT t.id, t.title, t.title_en
       FROM user_progress up
       JOIN titles t ON t.id = up.title_id AND t.tmdb_id IS NOT NULL
       JOIN streaming_cache s ON s.tmdb_id = t.tmdb_id AND s.type = t.type AND s.region = $2
      WHERE up.user_id = $1 AND up.watchlist AND NOT up.seen
        AND s.first_seen_at > now() - make_interval(days => $3)
        AND ($4::int[] IS NULL OR s.provider_id = ANY($4))
        AND NOT EXISTS (SELECT 1 FROM benachrichtigt b
                         WHERE b.user_id = up.user_id AND b.title_id = t.id AND b.art = 'stream')`,
    [person.id, region, FENSTER_TAGE, anbieter]
  );

  // Watchlist-Filme, die in der Region gerade angelaufen sind.
  const { rows: kino } = await pool.query(
    `SELECT DISTINCT t.id, t.title, t.title_en
       FROM user_progress up
       JOIN titles t ON t.id = up.title_id AND t.tmdb_id IS NOT NULL AND t.type = 'movie'
       JOIN cinema_cache c ON c.tmdb_id = t.tmdb_id AND c.region = $2
      WHERE up.user_id = $1 AND up.watchlist AND NOT up.seen
        AND c.release_date BETWEEN current_date - $3 AND current_date
        AND NOT EXISTS (SELECT 1 FROM benachrichtigt b
                         WHERE b.user_id = up.user_id AND b.title_id = t.id AND b.art = 'kino')`,
    [person.id, region, FENSTER_TAGE]
  );

  if (!stream.length && !kino.length) return 0;

  const T = TEXTE[sprache] || TEXTE.en;
  const name = (zeile) => sprachFeld(sprache, zeile.title, zeile.title_en);
  const teile = [];
  if (stream.length) teile.push(T.stream + '\n' + stream.map((z) => '  • ' + name(z)).join('\n'));
  if (kino.length) teile.push(T.kino + '\n' + kino.map((z) => '  • ' + name(z)).join('\n'));
  const text = teile.join('\n\n') + '\n\n' + T.fuss;

  await sendMail({ to: person.email, subject: T.betreff(stream.length + kino.length), text });

  // Erst NACH erfolgreichem Versand vermerken -- schlaegt der Versand fehl,
  // kommt der Treffer beim naechsten Lauf erneut.
  const werte = [];
  const platzhalter = [];
  let i = 1;
  for (const [liste, art] of [[stream, 'stream'], [kino, 'kino']]) {
    for (const zeile of liste) {
      platzhalter.push(`($${i++}, $${i++}, $${i++})`);
      werte.push(person.id, zeile.id, art);
    }
  }
  await pool.query(
    `INSERT INTO benachrichtigt (user_id, title_id, art) VALUES ${platzhalter.join(',')}
     ON CONFLICT DO NOTHING`,
    werte
  );
  return stream.length + kino.length;
}

async function lauf() {
  const { rows: personen } = await pool.query(
    `SELECT id, email, sprache, region, watch_provider_ids
       FROM users
      WHERE benachrichtigung AND email IS NOT NULL AND deletion_requested_at IS NULL`
  );
  let mails = 0, treffer = 0;
  for (const person of personen) {
    try {
      const n = await personBenachrichtigen(person);
      if (n) { mails++; treffer += n; }
    } catch (err) {
      console.error(`Benachrichtigung fuer users.id=${person.id} fehlgeschlagen:`, err.message);
    }
  }
  console.log(`Benachrichtigungen: ${personen.length} Abos geprueft, ${mails} Mails mit ${treffer} Treffern.`);
}

export function starteBenachrichtigung() {
  // Erster Lauf zur naechsten vollen Versandstunde (UTC), danach taeglich --
  // nicht beim Start: sonst hinge der Versandzeitpunkt am letzten Deploy.
  const jetzt = new Date();
  const naechster = new Date(jetzt);
  naechster.setUTCHours(VERSAND_STUNDE_UTC, 0, 0, 0);
  if (naechster <= jetzt) naechster.setUTCDate(naechster.getUTCDate() + 1);
  setTimeout(() => { lauf(); setInterval(lauf, EIN_TAG); }, naechster - jetzt);
  console.log(`Benachrichtigungs-Versand geplant fuer ${naechster.toISOString()}, danach taeglich.`);
}
