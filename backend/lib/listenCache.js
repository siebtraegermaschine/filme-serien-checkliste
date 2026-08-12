import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);

/* Zwischenspeicher fuer die beiden grossen Startlisten (/api/titles und
   /api/streaming).

   Warum ueberhaupt: Beide Antworten sind fuer JEDEN Besucher identisch --
   sie haengen an keiner Sitzung -- und aendern sich nur beim naechtlichen
   Import. Trotzdem baute der Server sie bei jedem Seitenaufruf neu aus der
   Datenbank. Gemessen an movietaste.de am 10. August 2026:

     /api/titles     TTFB 1.583 ms, 10,8 MB JSON
     /api/streaming  TTFB 1.649 ms,  5,7 MB JSON

   Beide laufen beim Start gleichzeitig und behindern sich dabei auch noch
   gegenseitig. Von den rund drei Sekunden bis zum ersten Titel entfielen
   damit etwa 1,6 auf reines Warten.

   Gespeichert wird die fertige Zeichenkette UND die gepackte Fassung. Das
   Packen von 10 MB kostet einige hundert Millisekunden; es einmal je Datenstand
   zu tun statt einmal je Besucher ist der zweite Teil der Ersparnis. Caddy
   packt nicht noch einmal, wenn die Antwort schon ein Content-Encoding hat.

   Ungueltig gemacht wird von Hand an den Stellen, die schreiben (Import,
   /ensure) -- siehe leeren(). Lieber ein Aufruf zu viel als eine Liste, die
   einen neuen Titel nicht zeigt. */

const EINTRAEGE = new Map();
const IM_BAU = new Map();

// Die Grenze ist eine Sicherung gegen Speicher-Volllaufen; verdraengt wird
// FIFO (siehe bauen). Seit der Region-Erweiterung gibt es mehr legitime
// Spielarten (2 Sprachen x 8 Regionen je Endpunkt) -- die meisten davon
// werden selten angefragt und duerfen ruhig neu gebaut werden, aber die
// Grenze muss gross genug sein, dass eine Handvoll seltener Kombinationen
// nicht die heissen DE-Eintraege verdraengt. 12 Eintraege sind bei ~13 MB je
// Titel-Liste (JSON + gzip) ein vertretbares Speicher-Maximum.
const MAX_EINTRAEGE = 12;

/* Wie lange ein Browser die Antwort ohne Rueckfrage verwenden darf. Zwei
   Minuten sind ein Kompromiss: Der Katalog aendert sich nur nachts, aber ein
   ueber /ensure neu angelegter Titel soll nicht lange fehlen. Danach fragt der
   Browser mit If-None-Match nach und bekommt in aller Regel ein 304 ohne
   Rumpf -- das ist der Gewinn beim zweiten Besuch. */
const MAX_AGE_SEKUNDEN = 120;
const STALE_SEKUNDEN = 600;

export function leeren(grund) {
  if (!EINTRAEGE.size) return;
  const anzahl = EINTRAEGE.size;
  EINTRAEGE.clear();
  console.log(`Listen-Zwischenspeicher geleert (${anzahl} Eintraege): ${grund}`);
}

async function bauen(schluessel, ermitteln) {
  const wert = await ermitteln();
  const json = JSON.stringify(wert);
  const eintrag = {
    json,
    gzip: await gzip(json),
    etag: '"' + crypto.createHash('sha1').update(json).digest('base64') + '"',
  };
  if (EINTRAEGE.size >= MAX_EINTRAEGE) EINTRAEGE.delete(EINTRAEGE.keys().next().value);
  EINTRAEGE.set(schluessel, eintrag);
  return eintrag;
}

/* Holt den Eintrag oder baut ihn. Laufen mehrere Anfragen gleichzeitig in einen
   kalten Schluessel -- genau der Fall direkt nach einem Deploy --, baut nur die
   erste, die anderen warten auf dasselbe Versprechen. Ohne das wuerden beim
   Neustart mehrere 10-MB-Abfragen parallel laufen. */
async function holen(schluessel, ermitteln) {
  const da = EINTRAEGE.get(schluessel);
  if (da) return da;
  if (IM_BAU.has(schluessel)) return IM_BAU.get(schluessel);
  const versprechen = bauen(schluessel, ermitteln).finally(() => IM_BAU.delete(schluessel));
  IM_BAU.set(schluessel, versprechen);
  return versprechen;
}

/* Beantwortet die Anfrage aus dem Zwischenspeicher. `ermitteln` wird nur
   aufgerufen, wenn nichts da ist, und muss den fertigen Antwortwert liefern. */
export async function ausListe(req, res, schluessel, ermitteln) {
  const eintrag = await holen(schluessel, ermitteln);

  res.setHeader('ETag', eintrag.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control',
    `public, max-age=${MAX_AGE_SEKUNDEN}, stale-while-revalidate=${STALE_SEKUNDEN}`);

  // Unveraendert? Dann nur die Kopfzeilen, kein Rumpf.
  const gesendet = req.headers['if-none-match'];
  if (gesendet && gesendet.split(',').some((w) => w.trim() === eintrag.etag)) {
    return res.status(304).end();
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Express' eigenes ETag wuerde sonst ueber den gepackten Rumpf gebildet und
  // unseres ueberschreiben.
  if (req.acceptsEncodings('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', String(eintrag.gzip.length));
    return res.end(eintrag.gzip);
  }
  res.setHeader('Content-Length', String(Buffer.byteLength(eintrag.json)));
  return res.end(eintrag.json);
}

/* Baut die Eintraege gleich beim Start, statt den ersten Besucher nach einem
   Deploy warten zu lassen. Fehler sind hier bewusst nur eine Meldung: Ist die
   Datenbank noch nicht so weit, baut der erste Aufruf den Eintrag eben selbst. */
export function vorwaermen(aufgaben) {
  for (const { schluessel, ermitteln } of aufgaben) {
    holen(schluessel, ermitteln)
      .then(() => console.log(`Listen-Zwischenspeicher vorgewaermt: ${schluessel}`))
      .catch((err) => console.warn(`Vorwaermen fehlgeschlagen (${schluessel}):`, err.message));
  }
}
