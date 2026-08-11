/* Missbrauchsschutz: ein Zaehler je Absender-Adresse und Zeitfenster.
 *
 * Bewusst selbst gebaut und im Speicher gehalten, statt ein Paket dafuer
 * hinzuzunehmen. Es laeuft EIN Backend-Prozess auf EINEM Server (siehe
 * docker-compose.yml) -- damit reicht eine Map, und das Projekt bleibt bei
 * seinen acht Abhaengigkeiten. Wuerde daraus einmal mehr als ein Prozess,
 * braeuchte es einen gemeinsamen Zaehler (Redis o.ae.); dann ist diese Datei
 * die Stelle, die getauscht wird, und sonst nichts.
 *
 * Festes Fenster, kein gleitendes: Wer die Grenze ausreizt, koennte an der
 * Fenstergrenze theoretisch das Doppelte schaffen. Bei Grenzen wie "5
 * Registrierungen je Stunde" ist das ohne Belang -- ein gleitendes Fenster
 * muesste je Adresse jeden einzelnen Zeitpunkt aufheben, statt nur eine Zahl.
 *
 * Zur Adresse: `app.set('trust proxy', 1)` steht in server.js, davor haengt
 * Caddy (reverse_proxy, siehe Caddyfile). Nachgemessen mit derselben
 * Express-Fassung:
 *
 *   ohne X-Forwarded-For                  -> req.ip = 127.0.0.1
 *   X-Forwarded-For: 203.0.113.7          -> req.ip = 203.0.113.7
 *   X-Forwarded-For: 1.2.3.4, 203.0.113.7 -> req.ip = 203.0.113.7
 *
 * Der dritte Fall ist der wichtige: Caddy HAENGT die echte Adresse an, statt
 * eine mitgeschickte zu ersetzen. Express zaehlt mit `trust proxy: 1` genau
 * einen Sprung von hinten ab und nimmt darum die echte -- eine vorgetaeuschte
 * Adresse verschafft also kein frisches Kontingent. Und es ist nicht Caddy, das
 * begrenzt wird.
 */

// Alle Zaehler in einer Map: "<name>|<adresse>" -> { anzahl, fensterEnde }.
const zaehler = new Map();

// Ohne Aufraeumen waechst die Map mit jeder je gesehenen Adresse weiter -- bei
// einem oeffentlichen Test ist genau das ein Angriffsweg. Der Lauf wirft weg,
// was ohnehin abgelaufen ist. unref(), damit ein Skript, das dieses Modul nur
// mitzieht, dadurch nicht am Laufen gehalten wird.
const AUFRAEUM_TAKT_MS = 5 * 60 * 1000;
const aufraeumer = setInterval(() => {
  const jetzt = Date.now();
  for (const [schluessel, eintrag] of zaehler) {
    if (eintrag.fensterEnde <= jetzt) zaehler.delete(schluessel);
  }
}, AUFRAEUM_TAKT_MS);
if (typeof aufraeumer.unref === 'function') aufraeumer.unref();

/**
 * Middleware, die höchstens `anzahl` Anfragen je `minuten` und Adresse zulaesst.
 *
 * @param {string} name    Eigener Zaehler je Endpunkt -- "login" und "register"
 *                         sollen sich nicht gegenseitig aufbrauchen.
 * @param {number} anzahl  Erlaubte Anfragen im Fenster.
 * @param {number} minuten Laenge des Fensters.
 */
export function limit(name, anzahl, minuten) {
  const fensterMs = minuten * 60 * 1000;
  return function (req, res, next) {
    // Abschaltbar fuer Tests und die lokale Entwicklung; in Produktion nie
    // gesetzt.
    if (process.env.LIMITS_DISABLED === '1') return next();

    const jetzt = Date.now();
    const schluessel = name + '|' + req.ip;
    let eintrag = zaehler.get(schluessel);
    if (!eintrag || eintrag.fensterEnde <= jetzt) {
      eintrag = { anzahl: 0, fensterEnde: jetzt + fensterMs };
      zaehler.set(schluessel, eintrag);
    }
    eintrag.anzahl++;

    if (eintrag.anzahl > anzahl) {
      const restSekunden = Math.max(1, Math.ceil((eintrag.fensterEnde - jetzt) / 1000));
      res.set('Retry-After', String(restSekunden));
      // Der Code wird im Frontend in einen deutschen Satz uebersetzt (siehe
      // apiRequest/limitMeldung in index.html); die Minuten kommen mit, damit
      // dort "in etwa X Minuten" stehen kann, ohne die Grenzen zu kennen.
      return res.status(429).json({ error: 'rate_limited', retryAfterSeconds: restSekunden });
    }
    next();
  };
}

// Nur fuer Tests: setzt alle Zaehler zurueck.
export function _zaehlerZuruecksetzen() {
  zaehler.clear();
}
