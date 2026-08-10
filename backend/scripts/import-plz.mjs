/*
 * import-plz.mjs -- Postleitzahlen mit Koordinate aus dem GeoNames-Abzug.
 *
 * Grundlage der Suche unter Einstellungen -> "Deine Kinos": Wer "56068" oder
 * "Koblenz" tippt, bekommt Vorschlaege, und aus dem gewaehlten Eintrag kommt
 * der Mittelpunkt fuer die Umkreissuche.
 *
 * Warum ein eigener Import statt eines Dienstes im Betrieb: Die
 * Vervollstaendigung feuert bei jedem Tastendruck. Das gegen einen fremden
 * Dienst laufen zu lassen, hiesse Wartezeit und Abhaengigkeit fuer etwas, das
 * sich im Jahr kaum aendert -- die Datei ist 384 kB gross. Geprueft wurde auch
 * die OpenPLZ API (openplzapi.org, 148 ms, ohne Schluessel); sie liefert aber
 * KEINE Koordinaten und taugt damit nur zur Anzeige, nicht zum Rechnen.
 *
 * Quelle: https://download.geonames.org/export/zip/DE.zip -- CC-BY 4.0. Die
 * Namensnennung gehoert in die Credits (siehe Einstellungen -> Credits), sobald
 * die Funktion sichtbar wird.
 *
 * Aufruf im Backend-Verzeichnis:
 *   node scripts/import-plz.mjs            # Deutschland
 *   node scripts/import-plz.mjs AT CH      # weitere Laender dazu
 *
 * Beliebig oft wiederholbar: Bestehende Zeilen werden aktualisiert, nicht
 * gedoppelt (UNIQUE auf plz+ort).
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import zlib from 'node:zlib';

const LAENDER = process.argv.slice(2).filter((a) => /^[A-Z]{2}$/.test(a));
const ZIELE = LAENDER.length ? LAENDER : ['DE'];

/* Die Datei ist ein ZIP mit genau zwei Eintraegen (readme.txt und <Land>.txt).
   Statt eine ZIP-Bibliothek dafuer aufzunehmen, wird der gesuchte Eintrag von
   Hand herausgeschnitten -- das Format ist seit Jahrzehnten stabil.

   Gelesen wird das INHALTSVERZEICHNIS am Dateiende, nicht die Koepfe am Anfang.
   Grund: GeoNames packt im Streaming-Verfahren (Flag-Bit 3), und dann stehen
   Groesse und Pruefsumme im lokalen Kopf auf null -- sie folgen erst hinter den
   Daten. Wer sich am Anfang entlanghangelt, kommt schon nach dem ersten Eintrag
   nicht weiter und findet die Landesdatei nie. Im Inhaltsverzeichnis stehen die
   Groessen dagegen immer. */
function ausZipHolen(buf, nameGesucht) {
  // Das Ende-Kennzeichen von hinten suchen (dahinter darf ein Kommentar stehen).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Kein ZIP-Inhaltsverzeichnis gefunden.');

  const anzahl = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < anzahl; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(pos + 10);
    const gepackt = buf.readUInt32LE(pos + 20);
    const nameLaenge = buf.readUInt16LE(pos + 28);
    const extraLaenge = buf.readUInt16LE(pos + 30);
    const kommentarLaenge = buf.readUInt16LE(pos + 32);
    const lokal = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLaenge).toString('utf8');

    if (nameGesucht(name)) {
      // Im lokalen Kopf stehen Name und Zusatzfeld ggf. anders lang als im
      // Inhaltsverzeichnis -- die Datenposition muss von dort kommen.
      const lokalName = buf.readUInt16LE(lokal + 26);
      const lokalExtra = buf.readUInt16LE(lokal + 28);
      const start = lokal + 30 + lokalName + lokalExtra;
      const daten = buf.subarray(start, start + gepackt);
      return methode === 0 ? daten : zlib.inflateRawSync(daten);
    }
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  throw new Error('Im ZIP wurde keine passende Datei gefunden.');
}

async function landImportieren(land) {
  const url = `https://download.geonames.org/export/zip/${land}.zip`;
  process.stdout.write(`${land}: lade ${url} … `);
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const zip = Buffer.from(await antwort.arrayBuffer());
  console.log(`${(zip.length / 1024).toFixed(0)} kB`);

  const text = ausZipHolen(zip, (n) => n.toUpperCase() === `${land}.TXT`).toString('utf8');

  /* Tabulatorgetrennt, Spalten laut readme:
     0 Land  1 PLZ  2 Ort  3..8 Verwaltungsebenen  9 lat  10 lon  11 Genauigkeit */
  const zeilen = [];
  for (const zeile of text.split('\n')) {
    if (!zeile.trim()) continue;
    const f = zeile.split('\t');
    const plz = (f[1] || '').trim();
    const ort = (f[2] || '').trim();
    const lat = Number(f[9]);
    const lon = Number(f[10]);
    if (!plz || !ort || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    zeilen.push([plz, ort, land, lat, lon]);
  }
  console.log(`${land}: ${zeilen.length} Zeilen gelesen, schreibe …`);

  const client = await pool.connect();
  let geschrieben = 0;
  try {
    await client.query('BEGIN');
    // In Haeppchen, damit ein einzelner Fehler nicht 16.000 Zeilen mitreisst
    // und der Fortschritt sichtbar bleibt.
    for (let i = 0; i < zeilen.length; i += 500) {
      const teil = zeilen.slice(i, i + 500);
      const werte = [];
      const platzhalter = teil.map((z, k) => {
        werte.push(...z);
        const b = k * 5;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
      });
      const { rowCount } = await client.query(
        `INSERT INTO plz (plz, ort, land, lat, lon) VALUES ${platzhalter.join(',')}
         ON CONFLICT (plz, ort) DO UPDATE
            SET land = EXCLUDED.land, lat = EXCLUDED.lat, lon = EXCLUDED.lon`,
        werte
      );
      geschrieben += rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`${land}: ${geschrieben} Zeilen geschrieben.`);
}

async function main() {
  for (const land of ZIELE) await landImportieren(land);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM plz');
  console.log(`\nBestand jetzt: ${rows[0].n} Postleitzahlen.`);
  console.log('Quelle: GeoNames (CC-BY 4.0) -- Namensnennung in den Credits nicht vergessen.');
}

main()
  .catch((err) => { console.error('Import fehlgeschlagen:', err); process.exitCode = 1; })
  .finally(() => pool.end());
