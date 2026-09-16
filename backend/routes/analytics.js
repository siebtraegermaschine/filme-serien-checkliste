/* Kennzahlen-Ansicht fuer den Betreiber (Christian, 16.09.2026) -- nach dem
   Vorbild von CouchUltras (backend/routes/analytics.js dort, Stand 07.09.2026).
   GET /api/analytics liefert alles fuer die vier Tabs der Ansicht --
   AUSSCHLIESSLICH fuer das Betreiber-Konto (ANALYTICS_EMAIL, standardmaessig
   c.neubauer@digital-wings.com). Der Menuepunkt im Frontend ist nur Komfort;
   die Zugangskontrolle sitzt HIER: Jede andere Kennung bekommt 404 (nicht
   403 -- die Route muss fuer Fremde gar nicht existieren).

   Tabs: Ueberblick (KPI-Tabelle in drei Bloecken plus 30-Tage-Kurve),
   Funnel (Stufen vom SEO-Aufruf bis zum zehnten markierten Titel), Seiten
   (Aufrufe je Pfad), Herkunft (Kategorie der verweisenden Seite, Weg von
   den SEO-Seiten in die App, Geraetetyp).

   Je KPI vier Spalten: Gesamt, heute (letzte 24 h), letzte 7 Tage, letzte
   30 Tage -- die drei Fenster bringen ihren Vergleich (Vortag, Vorwoche,
   Vormonat) mit, das Frontend zeigt ihn klein in derselben Zelle.

   Alle Zahlen sind zusammengefasste Zaehlungen ohne Personenbezug -- genau
   die Auswertung, die Abschnitt 4 der Datenschutzerklaerung beschreibt.
   Die Wochen-Snapshots fuer das externe Cockpit (lib/kpi.js) bleiben davon
   unberuehrt; diese Route rechnet live und ist bewusst einfacher.
   Anders als CouchUltras ohne Stichtag: Die Erfassung laeuft seit dem
   14.08.2026 im Echtbetrieb, es gibt keinen Testzeitraum auszublenden. */
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

/* ---- Zusatz-Auswertungen fuer die Tabs ----
   Alles weiterhin zusammengefasste Zaehlungen ohne Personenbezug. Pfad,
   Herkunft, Geraetetyp und Tageskennung werden erst seit dem 16.09.2026
   mitgeschrieben -- aeltere Zeilen gibt es fuer diese Ereignisse nicht. */
const OHNE_BOTS = `(props->>'bot') IS DISTINCT FROM 'true'`;
// Seitenaufrufe: SEO-Seiten am Server (seo_aufruf) und App-Ansichten per
// Ping (seite_aufruf).
const SEITEN_NAMEN = `('seo_aufruf', 'seite_aufruf')`;
const TAG_BERLIN = `(ts AT TIME ZONE 'Europe/Berlin')::date`;
/* "Geraete je Tag, Summe": verschiedene cookielose Tageskennungen je
   Berliner Kalendertag, ueber das Fenster aufsummiert (lib/tageskennung.js).
   Ein Geraet an drei Tagen zaehlt dreimal -- Wiedererkennung ueber Tage ist
   mit dieser Kennung absichtlich unmoeglich. */
const tagesGeraete = (namen, von, bis) => zahl(
  `SELECT count(DISTINCT (${TAG_BERLIN}, tages_id)) AS n FROM analytics_events
    WHERE name IN ${namen} AND tages_id IS NOT NULL AND ${OHNE_BOTS}
      AND ts >= now() - ($1 || ' days')::interval AND ts < now() - ($2 || ' days')::interval`,
  [String(von), String(bis)]);
const tagesGeraeteGesamt = (namen) => zahl(
  `SELECT count(DISTINCT (${TAG_BERLIN}, tages_id)) AS n FROM analytics_events
    WHERE name IN ${namen} AND tages_id IS NOT NULL AND ${OHNE_BOTS}`);
// Vier Zeitspalten je Gruppe: gesamt, 24 h, 7 Tage, 30 Tage.
const ZEITSPALTEN = `count(*) AS gesamt,
  count(*) FILTER (WHERE ts >= now() - interval '1 day') AS t1,
  count(*) FILTER (WHERE ts >= now() - interval '7 days') AS t7,
  count(*) FILTER (WHERE ts >= now() - interval '30 days') AS t30`;
const zahlen = (r) => ({ gesamt: Number(r.gesamt), t1: Number(r.t1), t7: Number(r.t7), t30: Number(r.t30) });

const GERAET_LABEL = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Desktop / Sonstige', unbekannt: 'Nicht erfasst' };
const HERKUNFT_LABEL = {
  direkt: 'Direkt (Adresse, Lesezeichen, installierte App)',
  intern: 'Eigene Seiten (intern)',
  suche: 'Suchmaschine',
  social: 'Social Media & Messenger',
  ki: 'KI-Assistent',
  sonstige: 'Andere Website',
  unbekannt: 'Nicht erfasst',
};
const WEG_LABEL = { app: '„Zur App" im Kopf der Seite', titel: '„Zur Watchlist hinzufügen" auf der Titelseite' };

/* Tageswerte der letzten 30 Tage (Berliner Kalendertage, auch leere Tage):
   App-Oeffnungen (1x je Geraet und Tag) und SEO-Aufrufe ohne Crawler -- die
   Kurve im Ueberblick. */
async function verlauf() {
  const { rows } = await pool.query(
    `WITH tage AS (
       SELECT generate_series((now() AT TIME ZONE 'Europe/Berlin')::date - 29,
                              (now() AT TIME ZONE 'Europe/Berlin')::date, interval '1 day')::date AS tag),
     e AS (
       SELECT ${TAG_BERLIN} AS tag,
              count(*) FILTER (WHERE name = 'app_opened' AND anon_id <> $1) AS oeffnungen,
              count(*) FILTER (WHERE name = 'seo_aufruf' AND ${OHNE_BOTS}) AS seo
         FROM analytics_events
        WHERE name IN ('app_opened', 'seo_aufruf') AND ts >= now() - interval '31 days'
        GROUP BY 1)
     SELECT to_char(t.tag, 'YYYY-MM-DD') AS tag, coalesce(e.oeffnungen, 0) AS oeffnungen, coalesce(e.seo, 0) AS seo
       FROM tage t LEFT JOIN e ON e.tag = t.tag ORDER BY t.tag`,
    [SYSTEM_ANON_ID]);
  return rows.map((r) => ({ tag: r.tag, oeffnungen: Number(r.oeffnungen), seo: Number(r.seo) }));
}

/* Funnel fuer ein Tage-Fenster: von der SEO-Seite bis zum zehnten markierten
   Titel. Die Stufen zaehlen verschiedene Groessen (Aufrufe, Geraete, Konten)
   -- eine Lesehilfe fuer den Weg in die App, keine Verfolgung von Personen.
   Die beiden Markierungs-Stufen kommen aus den anonymen Trichter-Zaehlern
   (metrik_tage, lib/metrik.js): je Tag eine blanke Zahl, ohne Kennung. */
async function trichter(tage) {
  const t = String(tage);
  const ereignis = (name, zusatz = '') => zahl(
    `SELECT count(*) AS n FROM analytics_events
      WHERE name = $1 AND ts >= now() - ($2 || ' days')::interval${zusatz}`, [name, t]);
  const metrik = (schritt) => zahl(
    `SELECT coalesce(sum(anzahl), 0) AS n FROM metrik_tage WHERE schritt = $1 AND tag > CURRENT_DATE - $2::int`,
    [schritt, tage]);
  const [seo, weiter, geoeffnet, ersteMarkierung, konten, einstieg, zehn] = await Promise.all([
    ereignis('seo_aufruf', ` AND ${OHNE_BOTS}`),
    ereignis('seo_weiter', ` AND ${OHNE_BOTS}`),
    ereignis('app_opened'),
    metrik('erste-markierung'),
    zahl(`SELECT count(*) AS n FROM users WHERE created_at >= now() - ($1 || ' days')::interval`, [t]),
    zahl(`SELECT count(*) AS n FROM user_onboarding WHERE abgeschlossen_am >= now() - ($1 || ' days')::interval`, [t]),
    metrik('zehn-titel'),
  ]);
  return [
    { label: 'SEO-Seiten aufgerufen (ohne Crawler)', wert: seo },
    { label: 'Von einer SEO-Seite in die App geklickt', wert: weiter },
    { label: 'App geöffnet (1× je Gerät und Tag)', wert: geoeffnet },
    { label: 'Erste Markierung gesetzt (Geräte, auch ohne Konto)', wert: ersteMarkierung },
    { label: 'Konto angelegt', wert: konten },
    { label: 'Einstieg abgeschlossen (Onboarding)', wert: einstieg },
    { label: 'Zehn Titel markiert (Taste-Score aktiv)', wert: zehn },
  ];
}

/* Aufrufe je Seite (SEO-Seiten und App-Ansichten), sortiert nach
   menschlichen Aufrufen; Crawler stehen als eigene Spalte daneben. */
async function seiten() {
  const { rows } = await pool.query(
    `SELECT props->>'pfad' AS pfad, min(props->>'typ') AS typ,
            count(*) FILTER (WHERE ${OHNE_BOTS}) AS gesamt,
            count(*) FILTER (WHERE ${OHNE_BOTS} AND ts >= now() - interval '1 day') AS t1,
            count(*) FILTER (WHERE ${OHNE_BOTS} AND ts >= now() - interval '7 days') AS t7,
            count(*) FILTER (WHERE ${OHNE_BOTS} AND ts >= now() - interval '30 days') AS t30,
            count(*) FILTER (WHERE NOT ${OHNE_BOTS}) AS bots,
            count(DISTINCT (${TAG_BERLIN}, tages_id)) FILTER (WHERE ${OHNE_BOTS} AND tages_id IS NOT NULL AND ts >= now() - interval '30 days') AS geraete30
       FROM analytics_events
      WHERE name IN ${SEITEN_NAMEN}
      GROUP BY 1 ORDER BY gesamt DESC, bots DESC, pfad LIMIT 300`);
  return rows.map((r) => ({ pfad: r.pfad, typ: r.typ, ...zahlen(r), bots: Number(r.bots), geraete30: Number(r.geraete30) }));
}

/* Herkunft der Aufrufe (Kategorie aus lib/herkunft.js) getrennt fuer SEO-
   Seiten und App, dazu die Wege von den SEO-Seiten in die App und der
   Geraetetyp. */
async function herkunft() {
  // namen: feste SQL-Liste aus DIESEM Modul, schluessel ebenso -- nie Nutzereingabe.
  const gruppe = async (namen, schluessel, labels) => {
    const { rows } = await pool.query(
      `SELECT coalesce(props->>'${schluessel}', 'unbekannt') AS k, ${ZEITSPALTEN}
         FROM analytics_events
        WHERE name IN ${namen} AND ${OHNE_BOTS}
        GROUP BY 1 ORDER BY gesamt DESC`);
    return rows.map((r) => ({ label: labels[r.k] || r.k, ...zahlen(r) }));
  };
  const [seo, app, wege, seoGeraet, appGeraet] = await Promise.all([
    gruppe(`('seo_aufruf')`, 'herkunft', HERKUNFT_LABEL),
    gruppe(`('seite_aufruf')`, 'herkunft', HERKUNFT_LABEL),
    gruppe(`('seo_weiter')`, 'von', WEG_LABEL),
    gruppe(`('seo_aufruf')`, 'geraet', GERAET_LABEL),
    gruppe(`('seite_aufruf')`, 'geraet', GERAET_LABEL),
  ]);
  return { seo, app, wege, seoGeraet, appGeraet };
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
  if (!rows[0] || !istBetreiber(rows[0].email)) {
    return res.status(404).json({ error: 'not_found' });
  }

  // Nur menschliche Aufrufe zaehlen -- Crawler stehen mit bot:true dabei.
  const ohneBots = ` AND ${OHNE_BOTS}`;
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
  const tagesSatz = (namen) => satz(
    `SELECT count(DISTINCT (${TAG_BERLIN}, tages_id)) AS n FROM analytics_events
      WHERE name IN ${namen} AND tages_id IS NOT NULL AND ${OHNE_BOTS}`, [],
    (v, b) => tagesGeraete(namen, v, b));
  // Klicks von den SEO-Seiten in die App, getrennt nach Weg -- props.von ist
  // ein fester Aufzaehlungswert aus server.js, kein Freitext.
  const vonSeo = (von) => ` AND props->>'von' = '${von}'`;

  const [
    konten, kontenMitOptIn, oeffnungen, geraeteWerte, quote7, quoteVorwoche,
    einstieg, markierungen, einladungen, eingeloest, verknuepfungen,
    movieNights, momentaufnahmen, feedback, seo, seoTexte,
    seitenGesamt, tagesGesamt, tagesSeo, tagesApp, appAnsichten, seoZurApp, seoTitel,
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
    // Alle Seitenaufrufe zusammen: SEO-Seiten plus App-Ansichten.
    satz(`SELECT count(*) AS n FROM analytics_events WHERE name IN ${SEITEN_NAMEN} AND ${OHNE_BOTS}`, [],
      (v, b) => fenster('analytics_events', 'ts', v, b, ` AND name IN ${SEITEN_NAMEN}${ohneBots}`)),
    tagesSatz(SEITEN_NAMEN),
    tagesSatz(`('seo_aufruf')`),
    tagesSatz(`('seite_aufruf')`),
    ereignisSatz('seite_aufruf', ohneBots),
    ereignisSatz('seo_weiter', vonSeo('app') + ohneBots),
    ereignisSatz('seo_weiter', vonSeo('titel') + ohneBots),
  ]);

  /* Zeilenform: gesamt sowie t1/t7/t30 jeweils mit Vergleichswert (Vortag,
     Vorwoche, Vormonat) -- null heisst "fuer diese Groesse nicht sinnvoll". */
  const zeile = (label, [gesamt, t1, t1v, t7, t7v, t30, t30v], einheit = '') =>
    ({ label, gesamt, t1, t1v, t7, t7v, t30, t30v, einheit });
  const nurGesamt = (label, gesamt) => zeile(label, [gesamt, null, null, null, null, null, null]);
  /* Bloecke der Ueberblick-Tabelle: "gesamt" fuer alles, was Domain und
     Konten betrifft, "seo" fuer die SEO-Seiten, "app" fuer die App selbst. */
  const block = (name, zeilen) => zeilen.map((z) => ({ ...z, block: name }));
  const [verlaufWerte, trichter7, trichter30, seitenWerte, herkunftWerte] = await Promise.all([
    verlauf(), trichter(7), trichter(30), seiten(), herkunft(),
  ]);

  res.set('Cache-Control', 'no-store');
  res.json({
    stand: new Date().toISOString(),
    verlauf: verlaufWerte,
    trichter: { t7: trichter7, t30: trichter30 },
    seiten: seitenWerte,
    herkunft: herkunftWerte,
    zeilen: [
      ...block('gesamt', [
        zeile('Seitenaufrufe gesamt (SEO-Seiten + App, ohne Crawler)', seitenGesamt),
        zeile('Geräte je Tag, Summe (alle Seiten)', tagesGesamt),
        zeile('Konten', konten),
        nurGesamt('Konten mit Benachrichtigungs-Opt-in', kontenMitOptIn),
        zeile('Feedback-Nachrichten', feedback),
        zeile('SEO-Titeltexte in der Datenbank', seoTexte),
      ]),
      ...block('seo', [
        zeile('SEO-Seitenaufrufe ohne Crawler', seo),
        zeile('Geräte je Tag, Summe (SEO-Seiten)', tagesSeo),
        zeile('SEO → App: „Zur App" geklickt', seoZurApp),
        zeile('SEO → App: „Zur Watchlist hinzufügen" geklickt', seoTitel),
      ]),
      ...block('app', [
        zeile('App-Ansichten geöffnet (Start, Filme, Serien, Kino)', appAnsichten),
        zeile('Geräte je Tag, Summe (App)', tagesApp),
        zeile('App-Öffnungen (1× je Gerät und Tag)', oeffnungen),
        zeile('Eindeutige Geräte (Cookie mt_anon)', geraeteWerte),
        zeile('Wiederkehrer-Quote (Woche zu Woche)', [null, null, null, quote7, quoteVorwoche, null, null], '%'),
        zeile('Einstieg abgeschlossen (Onboarding)', einstieg),
        zeile('Markierungen (Watchlist, Gesehen, Sterne, Stimmen)', markierungen),
        zeile('Einladungen erzeugt', einladungen),
        zeile('Einladungen angenommen', eingeloest),
        zeile('Verknüpfte Profile', verknuepfungen),
        zeile('Movie-Night-Runden', movieNights),
        zeile('Titel geteilt (Momentaufnahmen)', momentaufnahmen),
      ]),
    ],
  });
});

export default router;
