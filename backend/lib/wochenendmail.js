/*
 * Woechentliche Wochenend-Mail "Drei fuer dein Wochenende" (IDEEN-WACHSTUM.md,
 * Vorschlag G -- am 14. August 2026 als DONNERSTAGS-Mail beschlossen, damit
 * die Empfehlungen vor dem Wochenende ankommen).
 *
 * Je Person (Opt-in users.benachrichtigung) donnerstags EINE Mail mit drei
 * Abschnitten:
 *   1. Bis zwei Watchlist-Titel, die bei den gewaehlten Anbietern in der
 *      Region der Person gerade streambar sind (dieselbe Anbieter-Regel wie
 *      im Frontend-Filter: keine Auswahl = jeder Anbieter zaehlt).
 *   2. Ein Vorschlag ausserhalb der eigenen Markierungen, gewaehlt nach den
 *      Genres der positiv markierten Titel. Der eigentliche Taste-Score lebt
 *      im Browser -- hier steht eine ehrliche Naeherung, und die Mail sagt
 *      dazu, WARUM der Titel vorgeschlagen wird.
 *   3. Kinovorschlaege fuer Donnerstag bis Sonntag in der Region: zuerst
 *      Watchlist-Filme, die gerade laufen, dann die groessten Titel der Woche.
 *
 * Wiederholungs-Schutz wie beim taeglichen Versand ueber `benachrichtigt`,
 * aber mit EIGENEN Art-Werten (we-stream/we-kino/we-tipp) -- sonst wuerde die
 * Wochenend-Mail der Verfuegbarkeits-Mail Titel wegnehmen und umgekehrt.
 * Kino-Eintraege ohne titles-Zeile (reine cinema_cache-Kandidaten) koennen
 * nicht vermerkt werden und duerfen sich wiederholen -- bei einem Kinostart,
 * der mehrere Wochen laeuft, ist das eher richtig als falsch.
 *
 * WICHTIG: Der automatische Versand haengt an WOCHENEND_MAIL_AKTIV=1 und ist
 * standardmaessig AUS -- die Freigabe ist eine offene Entscheidung von
 * Christian. Bis dahin gibt es nur den Hand-/Testversand ueber
 * `npm run wochenendmail` (siehe scripts/wochenendmail.mjs).
 */
import { pool } from '../db/pool.js';
import { sendMail } from './mailer.js';
import { sprachWahl, regionWahl, sprachFeld } from './i18n.js';

const EIN_TAG = 24 * 60 * 60 * 1000;
const VERSAND_WOCHENTAG_UTC = 4;  // Donnerstag (getUTCDay: So=0 ... Sa=6)
const VERSAND_STUNDE_UTC = 16;    // vor der taeglichen Verfuegbarkeits-Mail (18 UTC)
const KINO_LAUFZEIT_TAGE = 45;    // "laeuft gerade": Start in den letzten ~6 Wochen
const TIPP_MIN_RATING = 6.5;      // Qualitaetsboden fuer den Vorschlag
const TIPP_MIN_STIMMEN = 500;
const BASIS_URL = process.env.PUBLIC_BASE_URL || 'https://movietaste.de';

const LOCALES = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', nl: 'nl-NL', pt: 'pt-BR' };

/* users.watch_provider_ids traegt TMDB-Nummern; streaming_cache traegt sie seit
   dem regionalen Anbieterausbau je Zeile mit (tmdb_provider_id), sodass hier
   direkt verglichen werden kann. Frueher stand an dieser Stelle eine feste
   Zuordnung der vier Feed-Slugs -- die haette mit einem je Region dynamisch
   bestimmten Anbieterumfang alles Neue verschluckt, und sie war fuer Amazon in
   36 der 41 Regionen ohnehin falsch (dort ist Amazon Prime Video 119, nicht 9).

   null = nicht filtern (keine/leere Auswahl: jeder Anbieter zaehlt, wie im
   Frontend-Filter). Shops ohne Feed (Apple TV Store 2, Amazon Video 10) stehen
   ggf. mit in der Liste und treffen dort schlicht nichts. */
export function anbieterNummern(watchProviderIds) {
  if (!Array.isArray(watchProviderIds) || !watchProviderIds.length) return null;
  return watchProviderIds.map(Number).filter((n) => Number.isInteger(n));
}

/* Mailtexte je Oberflaechensprache. Hinweis: Die Genre-Namen im Vorschlags-
   Grund kommen unuebersetzt aus titles.genres (deutsche TMDB-Namen) -- fuer
   Nicht-de-Sprachen eine bekannte Luecke, dieselbe wie bei den Schlagwoertern. */
const TEXTE = {
  de: { betreff: 'MovieMatch: Drei für dein Wochenende',
        intro: 'Deine Auswahl für Donnerstag bis Sonntag:',
        stream: 'Aus deiner Watchlist, jetzt streambar:',
        tipp: 'Ein Vorschlag für dich:',
        tippGrund: (g) => `passt zu deinen Genres: ${g}`,
        kino: 'Im Kino:',
        watchlist: 'aus deiner Watchlist',
        startAm: (d) => `startet ${d}`,
        fuss: `Abbestellen: In der App unter Einstellungen die E-Mail-Benachrichtigung ausschalten.\n${BASIS_URL}` },
  en: { betreff: 'MovieMatch: Three for your weekend',
        intro: 'Your picks for Thursday to Sunday:',
        stream: 'From your watchlist, streaming now:',
        tipp: 'A suggestion for you:',
        tippGrund: (g) => `matches your genres: ${g}`,
        kino: 'In cinemas:',
        watchlist: 'from your watchlist',
        startAm: (d) => `opens ${d}`,
        fuss: `Unsubscribe: turn off email notifications under Settings in the app.\n${BASIS_URL}` },
  fr: { betreff: 'MovieMatch : Trois pour ton week-end',
        intro: 'Ta sélection du jeudi au dimanche :',
        stream: 'De ta watchlist, en streaming maintenant :',
        tipp: 'Une suggestion pour toi :',
        tippGrund: (g) => `correspond à tes genres : ${g}`,
        kino: 'Au cinéma :',
        watchlist: 'de ta watchlist',
        startAm: (d) => `sortie le ${d}`,
        fuss: `Se désabonner : désactive les notifications par e-mail dans les réglages de l’app.\n${BASIS_URL}` },
  es: { betreff: 'MovieMatch: Tres para tu fin de semana',
        intro: 'Tu selección de jueves a domingo:',
        stream: 'De tu watchlist, ya en streaming:',
        tipp: 'Una sugerencia para ti:',
        tippGrund: (g) => `encaja con tus géneros: ${g}`,
        kino: 'En cines:',
        watchlist: 'de tu watchlist',
        startAm: (d) => `estreno ${d}`,
        fuss: `Darse de baja: desactiva las notificaciones por correo en los ajustes de la app.\n${BASIS_URL}` },
  it: { betreff: 'MovieMatch: Tre per il tuo weekend',
        intro: 'La tua selezione da giovedì a domenica:',
        stream: 'Dalla tua watchlist, ora in streaming:',
        tipp: 'Un suggerimento per te:',
        tippGrund: (g) => `in linea con i tuoi generi: ${g}`,
        kino: 'Al cinema:',
        watchlist: 'dalla tua watchlist',
        startAm: (d) => `esce il ${d}`,
        fuss: `Disiscriviti: disattiva le notifiche e-mail nelle impostazioni dell’app.\n${BASIS_URL}` },
  nl: { betreff: 'MovieMatch: Drie voor je weekend',
        intro: 'Jouw selectie voor donderdag tot zondag:',
        stream: 'Uit je watchlist, nu te streamen:',
        tipp: 'Een suggestie voor jou:',
        tippGrund: (g) => `past bij je genres: ${g}`,
        kino: 'In de bioscoop:',
        watchlist: 'uit je watchlist',
        startAm: (d) => `start ${d}`,
        fuss: `Afmelden: zet e-mailmeldingen uit bij Instellingen in de app.\n${BASIS_URL}` },
  pt: { betreff: 'MovieMatch: Três para o seu fim de semana',
        intro: 'Sua seleção de quinta a domingo:',
        stream: 'Da sua watchlist, já em streaming:',
        tipp: 'Uma sugestão para você:',
        tippGrund: (g) => `combina com seus gêneros: ${g}`,
        kino: 'No cinema:',
        watchlist: 'da sua watchlist',
        startAm: (d) => `estreia ${d}`,
        fuss: `Cancelar: desative as notificações por e-mail nas configurações do app.\n${BASIS_URL}` },
};

/* Baut die Mail fuer eine Person. Gibt {betreff, text, vermerke} zurueck oder
   null, wenn es fuer diese Woche nichts zu sagen gibt. Schreibt selbst KEINE
   benachrichtigt-Zeilen -- das macht der Aufrufer erst nach dem Versand. */
export async function wochenendMailBauen(person) {
  const region = regionWahl(person.region);
  const sprache = sprachWahl(person.sprache);
  const anbieter = anbieterNummern(person.watch_provider_ids);

  // 1. Watchlist-Titel, die gerade streambar sind -- die besten zwei.
  const { rows: stream } = anbieter && !anbieter.length ? { rows: [] } : await pool.query(
    `SELECT t.id, t.title, t.title_en, t.uebersetzungen,
            (ARRAY_AGG(DISTINCT s.provider_name))[1:3] AS anbieter
       FROM user_progress up
       JOIN titles t ON t.id = up.title_id AND t.tmdb_id IS NOT NULL
       JOIN streaming_cache s ON s.tmdb_id = t.tmdb_id AND s.type = t.type AND s.region = $2
      WHERE up.user_id = $1 AND up.watchlist AND NOT up.seen
        AND ($3::int[] IS NULL OR s.tmdb_provider_id = ANY($3))
        AND NOT EXISTS (SELECT 1 FROM benachrichtigt b
                         WHERE b.user_id = up.user_id AND b.title_id = t.id AND b.art = 'we-stream')
      GROUP BY t.id, t.title, t.title_en, t.uebersetzungen, t.rating
      ORDER BY t.rating DESC NULLS LAST
      LIMIT 2`,
    [person.id, region, anbieter]
  );

  // 2. Der Vorschlag: erst die Genres der positiv markierten Titel zaehlen
  // (Watchlist oder Gesehen ohne schlechte Bewertung -- dieselbe Grenze wie
  // beim Taste-Match, Rating < 6 zaehlt nicht) ...
  const { rows: genreZeilen } = await pool.query(
    `SELECT g AS genre, COUNT(*)::int AS n
       FROM user_progress up
       JOIN titles t ON t.id = up.title_id, unnest(t.genres) g
      WHERE up.user_id = $1
        AND (up.watchlist OR (up.seen AND (up.rating IS NULL OR up.rating >= 6)))
      GROUP BY g ORDER BY n DESC LIMIT 3`,
    [person.id]
  );
  const genres = genreZeilen.map((z) => z.genre);

  // ... dann ein gut bewerteter, unmarkierter Titel aus diesen Genres.
  let tipp = null;
  if (genres.length) {
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.title_en, t.uebersetzungen,
              ARRAY(SELECT unnest(t.genres) INTERSECT SELECT unnest($2::text[])) AS treffer_genres
         FROM titles t
        WHERE t.tmdb_id IS NOT NULL AND t.genres && $2::text[]
          AND t.rating >= $3 AND t.vote_count >= $4
          AND NOT EXISTS (SELECT 1 FROM user_progress up
                           WHERE up.user_id = $1 AND up.title_id = t.id AND (up.seen OR up.watchlist))
          AND NOT EXISTS (SELECT 1 FROM user_hidden_titles h
                           WHERE h.user_id = $1 AND h.title_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM benachrichtigt b
                           WHERE b.user_id = $1 AND b.title_id = t.id AND b.art = 'we-tipp')
        ORDER BY t.rating DESC, t.vote_count DESC
        LIMIT 1`,
      [person.id, genres, TIPP_MIN_RATING, TIPP_MIN_STIMMEN]
    );
    tipp = rows[0] || null;
  }

  // 3. Kino von heute (Donnerstag) bis Sonntag: laufende und startende Filme
  // der Region, Watchlist zuerst, Gesehenes nie. ISODOW: Mo=1..So=7 -- der
  // Sonntag dieser Woche liegt (7 - ISODOW) Tage voraus.
  const { rows: kino } = await pool.query(
    `SELECT t.id, c.title, c.title_en, c.uebersetzungen, c.release_date,
            COALESCE(up.watchlist, FALSE) AS aus_watchlist
       FROM cinema_cache c
       LEFT JOIN titles t ON t.tmdb_id = c.tmdb_id AND t.type = 'movie'
       LEFT JOIN user_progress up ON up.user_id = $1 AND up.title_id = t.id
      WHERE c.region = $2
        AND c.release_date BETWEEN current_date - $3::int
                               AND current_date + (7 - EXTRACT(ISODOW FROM current_date)::int)
        AND COALESCE(up.seen, FALSE) = FALSE
        AND (t.id IS NULL OR NOT EXISTS
              (SELECT 1 FROM benachrichtigt b
                WHERE b.user_id = $1 AND b.title_id = t.id AND b.art = 'we-kino'))
      ORDER BY COALESCE(up.watchlist, FALSE) DESC, c.release_date DESC, c.vote_count DESC NULLS LAST
      LIMIT 3`,
    [person.id, region, KINO_LAUFZEIT_TAGE]
  );

  if (!stream.length && !tipp && !kino.length) return null;

  const T = TEXTE[sprache] || TEXTE.en;
  const locale = LOCALES[sprache] || 'en-GB';
  const name = (z) => sprachFeld(sprache, z.title, z.title_en, z.uebersetzungen, 't');

  const teile = [T.intro];
  if (stream.length) {
    teile.push(T.stream + '\n' + stream.map((z) =>
      `  • ${name(z)}${z.anbieter && z.anbieter.length ? ` (${z.anbieter.join(', ')})` : ''}`).join('\n'));
  }
  if (tipp) {
    const grund = tipp.treffer_genres && tipp.treffer_genres.length
      ? ` — ${T.tippGrund(tipp.treffer_genres.join(', '))}` : '';
    teile.push(T.tipp + '\n' + `  • ${name(tipp)}${grund}`);
  }
  if (kino.length) {
    const heute = new Date().toISOString().slice(0, 10);
    teile.push(T.kino + '\n' + kino.map((z) => {
      const zusaetze = [];
      if (z.aus_watchlist) zusaetze.push(T.watchlist);
      if (z.release_date && z.release_date.toISOString().slice(0, 10) > heute) {
        zusaetze.push(T.startAm(z.release_date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })));
      }
      return `  • ${name(z)}${zusaetze.length ? ` (${zusaetze.join(', ')})` : ''}`;
    }).join('\n'));
  }
  const text = teile.join('\n\n') + '\n\n' + T.fuss;

  // Vermerke fuer NACH dem Versand (nur Titel mit titles-Zeile).
  const vermerke = [];
  for (const z of stream) vermerke.push([z.id, 'we-stream']);
  if (tipp) vermerke.push([tipp.id, 'we-tipp']);
  for (const z of kino) if (z.id) vermerke.push([z.id, 'we-kino']);

  return { betreff: T.betreff, text, vermerke };
}

async function personVersorgen(person) {
  const mail = await wochenendMailBauen(person);
  if (!mail) return 0;
  await sendMail({ to: person.email, subject: mail.betreff, text: mail.text });

  // Erst NACH erfolgreichem Versand vermerken (wie beim taeglichen Versand).
  if (mail.vermerke.length) {
    const werte = [];
    const platzhalter = [];
    let i = 1;
    for (const [titleId, art] of mail.vermerke) {
      platzhalter.push(`($${i++}, $${i++}, $${i++})`);
      werte.push(person.id, titleId, art);
    }
    await pool.query(
      `INSERT INTO benachrichtigt (user_id, title_id, art) VALUES ${platzhalter.join(',')}
       ON CONFLICT DO NOTHING`,
      werte
    );
  }
  return 1;
}

export async function wochenendLauf() {
  const { rows: personen } = await pool.query(
    `SELECT id, email, sprache, region, watch_provider_ids
       FROM users
      WHERE benachrichtigung AND email IS NOT NULL AND deletion_requested_at IS NULL`
  );
  let mails = 0;
  for (const person of personen) {
    try {
      mails += await personVersorgen(person);
    } catch (err) {
      console.error(`Wochenend-Mail fuer users.id=${person.id} fehlgeschlagen:`, err.message);
    }
  }
  console.log(`Wochenend-Mail: ${personen.length} Abos geprueft, ${mails} Mails verschickt.`);
}

export function starteWochenendmail() {
  // Bewusst hinter einem Schalter, Default AUS: Die Funktion ist gebaut und
  // von Hand testbar (npm run wochenendmail), der automatische Versand an
  // alle wartet auf die ausdrueckliche Freigabe.
  if (process.env.WOCHENEND_MAIL_AKTIV !== '1') {
    console.log('Wochenend-Mail inaktiv (WOCHENEND_MAIL_AKTIV=1 nicht gesetzt).');
    return;
  }
  // Naechster Donnerstag zur Versandstunde (UTC), danach woechentlich.
  const jetzt = new Date();
  const naechster = new Date(jetzt);
  naechster.setUTCHours(VERSAND_STUNDE_UTC, 0, 0, 0);
  let tageVor = (VERSAND_WOCHENTAG_UTC - naechster.getUTCDay() + 7) % 7;
  if (tageVor === 0 && naechster <= jetzt) tageVor = 7;
  naechster.setUTCDate(naechster.getUTCDate() + tageVor);
  setTimeout(() => { wochenendLauf(); setInterval(wochenendLauf, 7 * EIN_TAG); }, naechster - jetzt);
  console.log(`Wochenend-Mail geplant fuer ${naechster.toISOString()}, danach woechentlich.`);
}
