#!/usr/bin/env node
// Erzeugt Personentexte (Schauspieler/Regisseure) ueber die Anthropic
// Message-Batches-API und schreibt sie direkt nach seo_content. Ersetzt fuer
// die Breite den subagentengetriebenen Weg (personen-pakete.mjs +
// personen-einspielen.mjs) -- Pendant zu seo-batch.mjs fuer Titeltexte, mit
// identischer Architektur (Chunks, Batch anlegen, auf "ended" pollen,
// pruefen, schreiben, Status-/Kostendatei fuer Neustarts).
//
// QUELLE ist ausschliesslich der Datensatz (TMDB-Biografie + eigene
// Katalog-Filmografie). Kein Netz, kein Modellwissen ueber die Person. Zwei
// Kontrollen greifen, identisch zum subagentengetriebenen Weg:
//   1. hier, mechanisch: formatFehlerPerson()/faktenVerdachtPerson() aus
//      seo-personen-check.mjs -- dieselben Funktionen, dieselbe Pruefung
//   2. keine LLM-Stichprobe bisher (Pendant zu seo-batch-pruefen.mjs fehlt
//      fuer Personen noch)
//
// Nur de-de: die Personentexte laufen bislang ausschliesslich deutsch (siehe
// personen-pakete.mjs/personen-einspielen.mjs), anders als die Titeltexte,
// die mehrsprachig sind.
//
// Aufruf:
//   ANTHROPIC_API_KEY=... node scripts/personen-batch.mjs --limit 50 --dry-run
//   ANTHROPIC_API_KEY=... node scripts/personen-batch.mjs --limit 800 --max-kosten 15
//
// Optionen:
//   --limit N            Hoechstzahl Personen-Rollen insgesamt (Standard: alle offenen)
//   --chunk-groesse N    Rollen je Batch (Standard 200)
//   --intervall N        Sekunden zwischen Status-Abfragen (Standard 30)
//   --model NAME         Standard claude-sonnet-5
//   --min-titel N        Priorisierungsschwelle, Titel gesamt (Standard 2)
//   --max-kosten ZAHL    Harte Obergrenze in Dollar echter Kosten (Standard 20)
//   --dry-run            Nichts nach seo_content schreiben, Texte nur ausgeben
//   --journal PFAD        JSONL-Protokoll je Text (Standard scripts/.personen-batch-journal.jsonl)
//   --status-datei PFAD  Lauf-Status: offener Batch, Kosten bisher, Versuchte (Standard scripts/.personen-batch-lauf.json)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { PERSON_ABSCHNITTE, datensatzPerson, formatFehlerPerson, faktenVerdachtPerson } from './seo-personen-check.mjs';
import { PREISE, kostenBerechnen, customId, schluesselAusCustomId, ergebnisZeilenLesen, statusLesen } from './seo-batch.mjs';

const NOTE_SQL = `CASE WHEN COALESCE(rating, 0) = 0 THEN 0
  ELSE (COALESCE(vote_count, 0)::float / (COALESCE(vote_count, 0) + 1000)) * rating
     + (1000::float / (COALESCE(vote_count, 0) + 1000)) * 6.76 END`;

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locale: 'de-de',
    limit: Number(hol('limit', Infinity)),
    chunkGroesse: Number(hol('chunk-groesse', '200')),
    intervall: Number(hol('intervall', '30')),
    model: hol('model', 'claude-sonnet-5'),
    minTitel: Number(hol('min-titel', '2')),
    maxKosten: Number(hol('max-kosten', '20')),
    dryRun: a.includes('--dry-run'),
    journal: hol('journal', path.join(import.meta.dirname, '.personen-batch-journal.jsonl')),
    statusDatei: hol('status-datei', path.join(import.meta.dirname, '.personen-batch-lauf.json')),
  };
}

// --- Kandidaten -------------------------------------------------------------
// Dieselbe Priorisierung wie personen-pakete.mjs (Schwelle, Biografie
// vorhanden, Namenskollisions-Plausibilitaetscheck), aber als flache Liste
// von Rollen-Eintraegen mit direktem NOT EXISTS gegen seo_content -- so wie
// kandidaten() in seo-batch.mjs. `ausschluss` sind Schluessel, die in DIESEM
// Lauf schon versucht wurden (siehe Kopfkommentar zu seo-batch.mjs).
async function kandidaten({ locale, limit, minTitel, ausschluss }) {
  const { rows } = await pool.query(
    `WITH regie AS (
       SELECT director AS name, count(*) AS anzahl
         FROM titles WHERE director IS NOT NULL AND director <> '' GROUP BY director
     ),
     besetzung AS (
       SELECT unnest(cast_names) AS name, count(*) AS anzahl
         FROM titles WHERE cast_names IS NOT NULL GROUP BY unnest(cast_names)
     ),
     titelzahl AS (
       SELECT name, sum(anzahl) AS gesamt FROM (
         SELECT * FROM regie UNION ALL SELECT * FROM besetzung
       ) x GROUP BY name
     ),
     fruehestes AS (
       SELECT name, min(year) AS jahr FROM (
         SELECT director AS name, year FROM titles WHERE director IS NOT NULL AND director <> '' AND year IS NOT NULL
         UNION ALL
         SELECT unnest(cast_names) AS name, year FROM titles WHERE cast_names IS NOT NULL AND year IS NOT NULL
       ) x GROUP BY name
     ),
     -- Ein tmdb_id kann mehrere Namens-Aliase in personen_resolution haben
     -- (z. B. Kuenstlername und buergerlicher Name) -- ohne Gruppierung nach
     -- tmdb_id entstehen doppelte Rollen-Eintraege mit demselben Schluessel,
     -- was die Batch-API wegen doppelter custom_ids hart ablehnt.
     personen AS (
       SELECT pr.tmdb_person_id AS tmdb_id, array_agg(DISTINCT pr.name) AS namen,
              max(pc.biografie) AS biografie, max(pc.geburtstag) AS geburtstag,
              sum(coalesce(r.anzahl, 0)) AS regie_anzahl, sum(coalesce(b.anzahl, 0)) AS besetzung_anzahl
         FROM personen_resolution pr
         JOIN titelzahl t ON t.name = pr.name
         JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
         LEFT JOIN regie r ON r.name = pr.name
         LEFT JOIN besetzung b ON b.name = pr.name
         LEFT JOIN fruehestes f ON f.name = pr.name
        WHERE pr.tmdb_person_id IS NOT NULL
          AND t.gesamt >= $1
          AND pc.biografie IS NOT NULL AND pc.biografie <> ''
          AND NOT (
                pc.geburtstag IS NOT NULL AND f.jahr IS NOT NULL
                AND (extract(year FROM pc.geburtstag)::int > f.jahr
                     OR f.jahr - extract(year FROM pc.geburtstag)::int < 5)
              )
        GROUP BY pr.tmdb_person_id
     ),
     rollen AS (
       SELECT tmdb_id, namen, biografie, geburtstag, 'regisseur' AS rolle FROM personen WHERE regie_anzahl > 0
       UNION ALL
       SELECT tmdb_id, namen, biografie, geburtstag, 'schauspieler' AS rolle FROM personen WHERE besetzung_anzahl > 0
     )
     SELECT tmdb_id, namen, biografie, geburtstag, rolle
       FROM rollen r
      WHERE NOT EXISTS (
              SELECT 1 FROM seo_content s
               WHERE s.bereich = 'person' AND s.locale = $2
                 AND s.schluessel = r.rolle || ':' || r.tmdb_id)
        AND NOT (r.rolle || ':' || r.tmdb_id = ANY($4::text[]))
      ORDER BY r.tmdb_id, r.rolle
      LIMIT $3`,
    [minTitel, locale, limit, [...ausschluss]]
  );
  return rows;
}

// namen: alle Aliase derselben tmdb_id (siehe kandidaten()) -- ein Titel kann
// unter einem anderen Alias verzeichnet sein als dem, der spaeter als Name
// angezeigt wird, deshalb hier gegen alle Aliase matchen.
async function filmografieFuerRolle(namen, rolle) {
  const bedingung = rolle === 'regisseur' ? 'director = ANY($1::text[])' : 'cast_names && $1::text[]';
  const { rows } = await pool.query(
    `SELECT title, year, type, genres, rating FROM titles
      WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
    [namen]
  );
  return rows;
}

const geburtstagString = (wert) => {
  if (!wert) return null;
  const d = new Date(wert);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Reichert eine Kandidatenzeile um ihre rollengefilterte Filmografie an und
// baut daraus dasselbe Person-Objekt, das datensatzPerson()/faktenVerdachtPerson()
// erwarten -- identisch zu personDatensatz() in personen-einspielen.mjs.
async function personObjekt(row) {
  const filme = await filmografieFuerRolle(row.namen, row.rolle);
  return {
    name: row.namen[0],
    rolle: row.rolle === 'regisseur' ? 'Regisseur/in' : 'Schauspieler/in',
    geburtstag: geburtstagString(row.geburtstag),
    biografie: row.biografie,
    filmografie: filme.map((f) => ({ title: f.title, year: f.year, type: f.type, genres: f.genres || [], rating: f.rating })),
  };
}

// --- Systemprompt -------------------------------------------------------
// Inhaltlich identisch zu seo-auftrag-personen.md (dieselben Verbote, dasselbe
// Format, dieselbe Wortzahl) -- fuer den einzelnen Batch-Aufruf umformuliert,
// ohne die dort dem Subagenten vorbehaltenen Teile (Paketdatei lesen,
// Selbstpruefung gegen ein separates Skript, Hilfsskript-Namenskonvention).
function systemPrompt() {
  return `Du schreibst redaktionelle Personentexte fuer das deutschsprachige Filmportal
movietaste.de -- Seiten zu Schauspielern und Regisseuren.

ABSOLUTE REGEL -- REALE PERSONEN
Es geht um lebende oder verstorbene reale Menschen. Eine erfundene oder falsch
zugeordnete Behauptung ist hier kein Stilfehler, sondern ein Falschangaben-
Risiko ueber eine echte Person. Der DATENSATZ ist deine EINZIGE Quelle. Du
darfst NICHTS schreiben, was nicht daraus hervorgeht. Nutze KEIN eigenes
Wissen ueber diese Person, auch wenn du sie zu kennen glaubst. Verboten sind
insbesondere:
- Auszeichnungen, Nominierungen, Festivalteilnahmen, Rekorde -- ausser der
  Biografietext im DATENSATZ nennt sie woertlich
- Privatleben, Beziehungen, Familie, Gesundheit, Krankheit, Todesumstaende --
  ausser der Biografietext nennt sie ausdruecklich
- Kontroversen, Skandale, rechtliche Auseinandersetzungen
- Werturteile ueber Talent oder Bedeutung ("einer der besten", "gefeiert",
  "Ikone", "Legende", "brillant")
- Karriereeinordnungen, Wirkung, Einfluss, Vermaechtnis -- das ist Interpretation
- Rollen, Filme oder Serien ausserhalb der mitgelieferten Filmografie
Wenn du etwas ueber die Person zu wissen glaubst, es steht aber nicht im
DATENSATZ: Es kommt nicht in den Text. Lieber ein Satz weniger als eine
Behauptung zu viel ueber einen echten Menschen.

Liegt die Biografie im DATENSATZ auf Englisch vor, gib ihren Inhalt auf
Deutsch wieder. Ergaenze dabei nichts.

ERLAUBT ist ausschliesslich:
- Was im Biografietext steht, in eigenen Worten
- Was die eigene Filmografie im DATENSATZ hergibt: Anzahl der Titel bei uns,
  Zeitspanne der Erscheinungsjahre, welche Genres darunter vorkommen, ob die
  Person vor allem in Filmen oder Serien auftaucht, wie unsere Bewertungen
  dieser Titel ausfallen
- Zwingende Schluesse daraus: Abstand zum Geburtsjahr bzw. zum aeltesten/
  neuesten Titel im Katalog, was eine Genrehaeufung bedeutet

FORMAT -- exakt diese drei Ueberschriften, in dieser Reihenfolge, keine weiteren:
### ${PERSON_ABSCHNITTE[0]}
### ${PERSON_ABSCHNITTE[1]}
### ${PERSON_ABSCHNITTE[2]}

Keine Aufzaehlungen, keine Fettschrift, keine Zwischenueberschriften. Fliesstext
in kurzen Absaetzen. 220 bis 280 Woerter (Ueberschriften zaehlen nicht mit;
unter 200 wird verworfen, ueber 340 ebenfalls). Bei sehr kurzer Biografie im
DATENSATZ bleibt der Werdegang-Absatz entsprechend kurz -- das durch mehr
Substanz aus den Katalogdaten ausgleichen, nicht durch Erfindung.

INHALT DER ABSCHNITTE
1. ${PERSON_ABSCHNITTE[0]} -- ausschliesslich Umformulierung des Biografietexts:
   Geburtsdatum/-ort falls genannt, Werdegang-Fakten, die der Text selbst nennt.
   Steht im DATENSATZ nichts oder kaum etwas, bleibt dieser Absatz kurz.
2. ${PERSON_ABSCHNITTE[1]} -- was die Person im Katalog an Titeln hat: ob als
   Schauspieler oder Regisseur, wie viele Titel, welche Genres ueberwiegen, ob
   eher Filme oder Serien, welche Zeitspanne die Titel abdecken. Keine Filme
   nennen, die nicht in der mitgelieferten Liste stehen.
3. ${PERSON_ABSCHNITTE[2]} -- die eigenen Bewertungen der Titel dieser Person
   nuechtern zusammenfassen, zeitlicher Abstand zum aeltesten/neuesten Titel.
   Keine erfundene Rezeption, keine Einordnung der Person selbst -- nur der
   Zahlen aus ihrer Filmografie bei uns.

TON
Sachlich, praezise, ohne Werbesprache. Keine Ausrufezeichen, keine
rhetorischen Fragen ans Publikum. Deutsche Anfuehrungszeichen „so". Bei
heiklen biografischen Details, die der DATENSATZ tatsaechlich nennt, nuechtern
und respektvoll bleiben, nichts dramatisieren oder beschoenigen.

QUELLE NICHT ERWAEHNEN
Die Leser kennen keinen „Datensatz" und keine „Biografie" als Feldname.
Schreibe nie „der Datensatz nennt", „laut Biografie", „im Katalog
verzeichnet" oder Aehnliches -- auch nicht "nicht hinterlegt/verzeichnet/
angegeben/vermerkt/ausgewiesen" fuer eine fehlende Angabe. Nenne die Angabe
direkt, oder lass sie weg, statt ihr Fehlen zu kommentieren.

BEWERTUNGEN MIT KOMMA SCHREIBEN
Bewertungen im DATENSATZ stehen mit Punkt ("6.9 von 10"). Im deutschen Text
steht das Dezimalkomma: "6,9 von 10".

STIMMENZAHLEN NICHT BEZIFFERN
Werte, die sich taeglich aendern koennen, nicht exakt beziffern, sondern
einordnen. Die Anzahl der Titel dieser Person im Katalog darfst du exakt
nennen.

Gib ausschliesslich den Text aus, ohne Vorrede und ohne Nachbemerkung.`;
}

function anfrageKoerper(model, p) {
  return {
    model,
    max_tokens: 2048,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `DATENSATZ\n${datensatzPerson(p)}\n\nSchreibe den Personentext.` }],
  };
}

async function mitWiederholung(aufruf, versuche = 5) {
  for (let versuch = 1; versuch <= versuche; versuch++) {
    const res = await aufruf();
    if (res.ok) return res;
    if (![429, 500, 502, 503, 529].includes(res.status)) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (versuch - 1))));
  }
  throw new Error(`API nach ${versuche} Versuchen nicht erreichbar`);
}

async function batchAnlegen({ apiKey, model, liste }) {
  const requests = liste.map(({ schluessel, p }) => ({
    custom_id: customId(schluessel),
    params: anfrageKoerper(model, p),
  }));
  const res = await mitWiederholung(() =>
    fetch('https://api.anthropic.com/v1/messages/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ requests }),
    })
  );
  return res.json();
}

async function batchStatus({ apiKey, id }) {
  const res = await mitWiederholung(() =>
    fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })
  );
  return res.json();
}

async function batchWartenBisEnde({ apiKey, id, intervall }) {
  for (;;) {
    const status = await batchStatus({ apiKey, id });
    if (status.processing_status === 'ended') return status;
    const c = status.request_counts || {};
    console.log(`  Batch ${id}: ${status.processing_status} -- verarbeitet ${c.processing ?? '?'}, fertig ${c.succeeded ?? 0}, Fehler ${c.errored ?? 0}`);
    await new Promise((r) => setTimeout(r, intervall * 1000));
  }
}

async function batchErgebnisse({ apiKey, resultsUrl }) {
  const res = await mitWiederholung(() =>
    fetch(resultsUrl, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } })
  );
  return ergebnisZeilenLesen(await res.text());
}

function statusSchreiben(pfad, status) {
  fs.writeFileSync(pfad, JSON.stringify(status, null, 2));
}

// --- Ein Chunk: Batch anlegen, abwarten, Ergebnisse pruefen und schreiben --
async function chunkVerarbeiten({ apiKey, opt, liste, protokoll, zaehler, status }) {
  let batchId = status.aktuellerBatch?.id;
  if (!batchId) {
    const batch = await batchAnlegen({ apiKey, model: opt.model, liste });
    batchId = batch.id;
    status.aktuellerBatch = { id: batchId, schluessel: liste.map((e) => e.schluessel), eingereichtAm: new Date().toISOString() };
    statusSchreiben(opt.statusDatei, status);
    console.log(`  Batch angelegt: ${batchId} (${liste.length} Personen-Rollen)`);
  } else {
    console.log(`  Nehme offenen Batch wieder auf: ${batchId}`);
  }

  const ended = await batchWartenBisEnde({ apiKey, id: batchId, intervall: opt.intervall });
  const zeilen = await batchErgebnisse({ apiKey, resultsUrl: ended.results_url });
  const nachSchluessel = new Map(liste.map((e) => [e.schluessel, e.p]));

  let beispieleGezeigt = 0;
  let kostenChunk = 0;
  for (const zeile of zeilen) {
    const schluessel = schluesselAusCustomId(zeile.custom_id);
    const p = nachSchluessel.get(schluessel);
    status.versucht.push(schluessel);

    if (zeile.result.type !== 'succeeded') {
      zaehler.fehler++;
      protokoll.write(JSON.stringify({ schluessel, locale: opt.locale, status: 'fehler', meldung: zeile.result.type, detail: zeile.result.error?.error?.message }) + '\n');
      continue;
    }

    const nachricht = zeile.result.message;
    const usage = nachricht.usage || {};
    const kosten = kostenBerechnen(usage, opt.model);
    kostenChunk += kosten;
    status.ausgegeben += kosten;
    status.aufrufe++;

    const text = (nachricht.content || []).map((c) => c.text || '').join('').trim();
    const ff = formatFehlerPerson(text);
    const fv = faktenVerdachtPerson(text, p);
    const basis = { schluessel, name: p.name, locale: opt.locale, formatFehler: ff, faktenVerdacht: fv };

    if (ff.length) { zaehler.format++; protokoll.write(JSON.stringify({ ...basis, status: 'format', text }) + '\n'); continue; }
    if (fv.length) { zaehler.fakten++; protokoll.write(JSON.stringify({ ...basis, status: 'fakten', text }) + '\n'); continue; }

    status.texte++;
    if (opt.dryRun) {
      console.log(`\n----- ${schluessel} · ${p.name} -----\n${text}`);
    } else {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text)
         VALUES ('person', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE
           SET text = EXCLUDED.text, aktualisiert_am = now()`,
        [schluessel, opt.locale, text]
      );
      if (beispieleGezeigt < 3) {
        beispieleGezeigt++;
        console.log(`\n----- Beispiel ${schluessel} · ${p.name} -----\n${text}`);
      }
    }
    zaehler.ok++;
    protokoll.write(JSON.stringify({ ...basis, status: 'ok' }) + '\n');
  }

  status.aktuellerBatch = null;
  statusSchreiben(opt.statusDatei, status);
  console.log(`  Chunk fertig: ${zeilen.length} Ergebnisse, ${kostenChunk.toFixed(2)} $ echte Kosten (gesamt bisher ${status.ausgegeben.toFixed(2)} $).`);
}

// --- Ablauf -----------------------------------------------------------------
async function main() {
  const opt = argumente();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY fehlt. Setze ihn in der Umgebung oder in backend/.env.');
    process.exit(1);
  }
  if (!PREISE[opt.model]) {
    console.error(`Keine Preise fuer Modell ${opt.model} hinterlegt (siehe PREISE in seo-batch.mjs) -- ohne Preise kein verlaesslicher Kostenabbruch.`);
    process.exit(1);
  }

  const status = statusLesen(opt.statusDatei);
  if (!status.versucht) status.versucht = [];
  const protokoll = fs.createWriteStream(opt.journal, { flags: 'a' });
  const zaehler = { ok: 0, format: 0, fakten: 0, fehler: 0 };
  const begonnen = Date.now();

  console.log(`Personentexte de-de · Modell ${opt.model} · Chunk-Groesse ${opt.chunkGroesse} · Obergrenze ${opt.maxKosten} $`);
  if (status.ausgegeben) console.log(`Fortsetzung eines Laufs: ${status.ausgegeben.toFixed(2)} $ bereits ausgegeben, ${status.texte} Texte bisher.`);

  if (status.aktuellerBatch) {
    const rows = status.aktuellerBatch.schluessel.map((s) => {
      const [rolle, tmdb_id] = s.split(':');
      return { rolle, tmdb_id: Number(tmdb_id) };
    });
    const liste = [];
    for (const r of rows) {
      const { rows: personRows } = await pool.query(
        `SELECT array_agg(DISTINCT pr.name) AS namen, max(pc.biografie) AS biografie, max(pc.geburtstag) AS geburtstag
           FROM personen_resolution pr
           JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
          WHERE pr.tmdb_person_id = $1
          GROUP BY pr.tmdb_person_id`,
        [r.tmdb_id]
      );
      if (!personRows.length) continue;
      const row = { ...personRows[0], tmdb_id: r.tmdb_id, rolle: r.rolle };
      liste.push({ schluessel: `${r.rolle}:${r.tmdb_id}`, p: await personObjekt(row) });
    }
    await chunkVerarbeiten({ apiKey, opt, liste, protokoll, zaehler, status });
  }

  let verbleibend = opt.limit;
  for (;;) {
    if (verbleibend <= 0) break;

    let chunkGroesse = Math.min(opt.chunkGroesse, verbleibend);
    if (status.aufrufe > 0) {
      const durchschnitt = status.ausgegeben / status.aufrufe;
      const budget = opt.maxKosten - status.ausgegeben;
      const maxTexte = Math.floor(budget / durchschnitt);
      if (maxTexte < 1) {
        console.log(`\nAbbruch: ${status.ausgegeben.toFixed(2)} $ ausgegeben, Obergrenze ${opt.maxKosten} $ -- ein weiterer Text wuerde sie ueberschreiten (Ø ${durchschnitt.toFixed(4)} $/Text).`);
        break;
      }
      chunkGroesse = Math.min(chunkGroesse, maxTexte);
    }

    const ausschluss = new Set(status.versucht);
    const rows = await kandidaten({ locale: opt.locale, limit: chunkGroesse, minTitel: opt.minTitel, ausschluss });
    if (!rows.length) { console.log('\nKeine offenen Kandidaten mehr.'); break; }

    console.log(`\nChunk: ${rows.length} Kandidaten`);
    const liste = [];
    for (const row of rows) liste.push({ schluessel: `${row.rolle}:${row.tmdb_id}`, p: await personObjekt(row) });
    await chunkVerarbeiten({ apiKey, opt, liste, protokoll, zaehler, status });

    if (status.ausgegeben >= opt.maxKosten) {
      console.log(`\nAbbruch nach diesem Chunk: ${status.ausgegeben.toFixed(2)} $ erreicht/ueberschreitet die Obergrenze von ${opt.maxKosten} $.`);
      break;
    }
    verbleibend -= rows.length;
  }

  protokoll.end();
  const dauer = Math.round((Date.now() - begonnen) / 1000);
  console.log(`\nFertig in ${dauer}s: ${zaehler.ok} geschrieben, ${zaehler.format} Formatfehler, ${zaehler.fakten} Faktenverdacht, ${zaehler.fehler} Fehler.`);
  console.log(`Kosten dieses Prozesslaufs: ${status.ausgegeben.toFixed(2)} $ echt (Statusdatei: ${opt.statusDatei}).`);
  if (zaehler.fakten) console.log('Faktenverdacht = verworfen und protokolliert, nicht geschrieben.');
  console.log(`Protokoll: ${opt.journal}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
