/*
 * import-kinos.mjs -- Kinos aus OpenStreetMap (amenity=cinema).
 *
 * Fuellt die Tabelle `kinos` fuer die Auswahl unter Einstellungen ->
 * "Deine Kinos". Nur Standorte, KEINE Spielplaene -- welche Filme wo laufen,
 * ist eine andere Frage und eine andere (kostenpflichtige) Quelle, siehe
 * PLAN-KINOS.md.
 *
 * Warum OSM: kostenlos, mit Koordinate, und in der Stichprobe brauchbar
 * gepflegt -- im Umkreis 30 km um Koblenz standen 9 Kinos, davon 6 mit
 * Postleitzahl und 4 mit Website. Die Koordinate ist immer da, und an ihr
 * haengt die Umkreissuche; die Adresse ist nur fuer die Anzeige.
 *
 * Lizenz: ODbL. Die Namensnennung ("© OpenStreetMap-Mitwirkende") gehoert in
 * die Credits, sobald die Funktion sichtbar wird.
 *
 * Aufruf im Backend-Verzeichnis:
 *   node scripts/import-kinos.mjs --dry-run     # nur zeigen, nichts schreiben
 *   node scripts/import-kinos.mjs               # Deutschland
 *   node scripts/import-kinos.mjs --laender=DE,AT,CH   # oder GB,FR,IT,ES,NL
 *
 * Die Overpass-API ist ein Gemeinschaftsdienst mit begrenzter Kapazitaet: Eine
 * Abfrage ueber ganz Deutschland lief in der Erprobung mehrfach in ein 504.
 * Deshalb wird in Kacheln gefragt, mit Pause dazwischen und einem zweiten
 * Server als Ausweichweg. Der Lauf dauert dadurch einige Minuten -- er ist
 * dafuer gedacht, selten zu laufen (etwa monatlich).
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const TROCKEN = process.argv.includes('--dry-run');
const laenderArg = (process.argv.find((a) => a.startsWith('--laender=')) || '').split('=')[1];
const LAENDER = (laenderArg || 'DE').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/* Grob umschriebene Rechtecke je Land, bewusst grosszuegig. Dadurch kommen
   Kinos aus dem Grenzgebiet mit hinein -- im Probelauf etwa Winterthur. Das
   ist ABSICHT und wird nicht herausgefiltert: Wer in Konstanz oder Aachen
   wohnt, hat das naechste Kino womoeglich jenseits der Grenze, und eine
   Umkreissuche, die an einer Landesgrenze endet, waere fuer genau diese Leute
   falsch. Ein Filter auf `addr:country` waere ohnehin unzuverlaessig, weil das
   Feld in OSM meist fehlt.

   Je Land EINE Liste von Rechtecken [Sued, West, Nord, Ost]: meist eines,
   mehrere dort, wo Landesteile weit auseinanderliegen (Spanien: Festland +
   Balearen und, als eigenes Rechteck, die Kanaren -- ein gemeinsames
   Rechteck bestuende sonst zum Grossteil aus Atlantik). Bewusst NICHT dabei:
   die franzoesischen Uebersee-Gebiete -- ein anderer Kontinent ist kein
   "Grenzgebiet" mehr; falls je gewuenscht, hier weitere Rechtecke ergaenzen. */
const RECHTECKE = {
  DE: [[47.2, 5.8, 55.1, 15.1]],
  AT: [[46.3, 9.5, 49.1, 17.2]],
  CH: [[45.8, 5.9, 47.9, 10.6]],
  GB: [[49.8, -8.7, 61.0, 2.0]],                // inkl. Nordirland und Shetland
  FR: [[41.2, -5.5, 51.4, 9.8]],                // inkl. Korsika
  IT: [[35.4, 6.5, 47.3, 18.8]],                // inkl. Sizilien und Sardinien
  ES: [[35.7, -9.8, 44.0, 4.5],                 // Festland + Balearen
       [27.5, -18.3, 29.5, -13.3]],             // Kanaren
  NL: [[50.6, 3.2, 53.8, 7.3]],
};

/* Kantenlaenge einer Abfrage. Gross gewaehlt, und zwar aus Messung: Die
   oeffentliche Overpass-Instanz antwortet unzuverlaessig, aber NICHT
   groessenabhaengig -- in der Erprobung lief 4x4 Grad (376 Kinos) in 15 s
   durch, waehrend 0,5x0,5 Grad im selben Zeitraum mit 504 abbrach. Weniger,
   groessere Abfragen sind also sowohl freundlicher als auch verlaesslicher. */
const KACHEL_GRAD = 4;
const PAUSE_MS = 4000;      // Ruecksicht auf einen Gemeinschaftsdienst

const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(abfrage) {
  let letzterFehler = null;
  for (const server of SERVER) {
    // Grosszuegig, weil 504 hier der Normalfall und kein Ausnahmefall ist.
    for (let versuch = 1; versuch <= 4; versuch++) {
      try {
        const antwort = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': 'MovieMatch/1.0 (movietaste.de)' },
          body: abfrage,
        });
        if (antwort.status === 429 || antwort.status === 504) {
          letzterFehler = new Error(`HTTP ${antwort.status}`);
          process.stdout.write(`    (${antwort.status}, warte ${(PAUSE_MS * 2 ** versuch) / 1000}s)\n`);
          await schlafen(PAUSE_MS * 2 ** versuch);
          continue;
        }
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        return await antwort.json();
      } catch (err) {
        letzterFehler = err;
        await schlafen(PAUSE_MS);
      }
    }
  }
  throw letzterFehler || new Error('Overpass nicht erreichbar');
}

function* kacheln([sued, west, nord, ost]) {
  for (let s = sued; s < nord; s += KACHEL_GRAD) {
    for (let w = west; w < ost; w += KACHEL_GRAD) {
      yield [s, w, Math.min(s + KACHEL_GRAD, nord), Math.min(w + KACHEL_GRAD, ost)];
    }
  }
}

/* Erotikkinos gehoeren nicht in diese Liste -- nicht aus Sittsamkeit, sondern
   weil dort die Filme, um die es in dieser App geht, gar nicht laufen. Wer
   "Deine Kinos" einstellt, sucht das Haus, in dem der naechste Kinostart zu
   sehen ist.

   Gefiltert wird ueber den NAMEN, und das ist bewusst die zweitbeste Loesung:
   OpenStreetMap hat dafuer kein verlaessliches Merkmal. Nachgesehen am Beispiel
   "Pleasure Shop Gaykino" in Trier -- `cinema`, `adult`, `shop` und
   `cinema:genre` sind dort alle leer, es unterscheidet sich in den Angaben also
   in nichts von einem gewoehnlichen Kino.

   Die Liste ist knapp gehalten: Sie faengt die eindeutigen Faelle und laesst im
   Zweifel etwas stehen, statt ein echtes Kino zu verschlucken. */
const NICHT_KINO = /(erotik|sexkino|pornokino|gaykino|sex-?shop|pleasure shop|filmpalast\s*eros)/i;

function zuKino(el) {
  const t = el.tags || {};
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
  if (lat == null || lon == null) return null;
  // Ohne Namen ist ein Eintrag in einer Auswahlliste wertlos -- man koennte ihn
  // nicht wiedererkennen.
  const name = (t.name || t['name:de'] || '').trim();
  if (!name) return null;
  if (NICHT_KINO.test(name)) return null;
  // Autokinos und Freilichtbuehnen bleiben drin, sie sind echte Kinos.
  // Ausgeschlossen wird, was nur beilaeufig einen Saal hat.
  if (t.disused === 'yes' || t['disused:amenity']) return null;
  return {
    quelle: 'osm',
    quelle_id: `${el.type}/${el.id}`,
    name,
    strasse: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || null,
    plz: t['addr:postcode'] || null,
    ort: t['addr:city'] || null,
    lat,
    lon,
    website: t.website || t['contact:website'] || null,
  };
}

async function main() {
  const gefunden = new Map();

  for (const land of LAENDER) {
    const rechtecke = RECHTECKE[land];
    if (!rechtecke) { console.warn(`Kein Rechteck fuer ${land} hinterlegt -- uebersprungen.`); continue; }
    const alle = rechtecke.flatMap((r) => [...kacheln(r)]);
    console.log(`${land}: ${alle.length} Kacheln`);
    let i = 0;
    for (const [s, w, n, o] of alle) {
      i++;
      const abfrage = `[out:json][timeout:90];
(
  node["amenity"="cinema"](${s},${w},${n},${o});
  way["amenity"="cinema"](${s},${w},${n},${o});
);
out tags center;`;
      const daten = await overpass(abfrage);
      let neu = 0;
      for (const el of daten.elements || []) {
        const k = zuKino(el);
        if (k && !gefunden.has(k.quelle_id)) { gefunden.set(k.quelle_id, k); neu++; }
      }
      process.stdout.write(`  Kachel ${i}/${alle.length}: +${neu} (gesamt ${gefunden.size})\n`);
      await schlafen(PAUSE_MS);
    }
  }

  console.log(`\n${gefunden.size} Kinos mit Namen und Koordinate gefunden.`);
  const mitPlz = [...gefunden.values()].filter((k) => k.plz).length;
  const mitWeb = [...gefunden.values()].filter((k) => k.website).length;
  console.log(`  davon mit Postleitzahl: ${mitPlz} | mit Website: ${mitWeb}`);

  if (TROCKEN) {
    console.log('\n--dry-run: nichts geschrieben. Erste zehn:');
    [...gefunden.values()].slice(0, 10).forEach((k) =>
      console.log(`  ${k.name} | ${k.plz || '—'} ${k.ort || ''} | ${k.website || ''}`));
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const k of gefunden.values()) {
      await client.query(
        `INSERT INTO kinos (quelle, quelle_id, name, strasse, plz, ort, lat, lon, website, gesehen_am)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CURRENT_DATE)
         ON CONFLICT (quelle, quelle_id) DO UPDATE
            SET name = EXCLUDED.name, strasse = EXCLUDED.strasse, plz = EXCLUDED.plz,
                ort = EXCLUDED.ort, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                website = EXCLUDED.website, gesehen_am = CURRENT_DATE`,
        [k.quelle, k.quelle_id, k.name, k.strasse, k.plz, k.ort, k.lat, k.lon, k.website]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  /* Geschlossene Kinos werden NICHT geloescht, nur gemeldet. Ein Loeschen wuerde
     ueber ON DELETE CASCADE die Auswahl der Leute mitreissen -- und ein
     fehlgeschlagener Lauf saehe aus wie "alle Kinos geschlossen". Wer aufraeumen
     will, tut das nach Sichtung von Hand. */
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM kinos WHERE quelle = 'osm' AND gesehen_am < CURRENT_DATE`
  );
  console.log(`\nGeschrieben. In OSM nicht mehr gefunden: ${rows[0].n} (bleiben stehen, siehe Kommentar).`);
  console.log('Quelle: © OpenStreetMap-Mitwirkende (ODbL) -- Namensnennung in den Credits nicht vergessen.');
}

main()
  .catch((err) => { console.error('Import fehlgeschlagen:', err); process.exitCode = 1; })
  .finally(() => pool.end());
