/* Einfache Mengenbegrenzung je IP und Endpunkt.

   Bewusst selbst gebaut statt express-rate-limit: Es laeuft genau EIN Prozess
   auf EINEM Server, damit reicht ein Zaehler im Speicher. Das Projekt kommt mit
   acht Abhaengigkeiten aus, und das soll so bleiben.

   Festes Fenster, kein gleitendes: Wer die Grenze reisst, wartet schlimmstenfalls
   bis zum Ende des laufenden Fensters. Fuer den Zweck -- Massenanlage von Konten
   und Mailfluten verhindern -- genuegt das; ein gleitendes Fenster braucht je
   Anfrage eine Liste von Zeitstempeln statt einer Zahl.

   Was das NICHT leistet: Ein Neustart setzt alle Zaehler zurueck, und wer viele
   IP-Adressen hat, umgeht es. Beides ist hier hinnehmbar -- es geht um die
   Gelegenheitsfaelle, nicht um einen entschlossenen Angriff. */

// Alle Zaehler, Schluessel ist `${name}:${ip}`.
const zaehler = new Map();

// Abgelaufene Eintraege wegraeumen. Ohne das waechst die Map mit jeder je
// gesehenen IP-Adresse weiter -- bei einem Prozess, der monatelang laeuft, ist
// das der einzige Weg, auf dem diese Loesung Schaden anrichten koennte.
const AUFRAEUM_TAKT_MS = 10 * 60 * 1000;
setInterval(() => {
  const jetzt = Date.now();
  for (const [schluessel, eintrag] of zaehler) {
    if (eintrag.fensterEnde <= jetzt) zaehler.delete(schluessel);
  }
}, AUFRAEUM_TAKT_MS).unref();

/**
 * Erzeugt eine Middleware, die hoechstens `anzahl` Anfragen je `minuten` und
 * IP-Adresse durchlaesst.
 *
 * @param {object} o
 * @param {string} o.name    Eigener Topf je Endpunkt -- sonst zaehlen Login und
 *                           Feedback gegeneinander.
 * @param {number} o.anzahl  Erlaubte Anfragen im Fenster.
 * @param {number} o.minuten Laenge des Fensters.
 */
export function mengenGrenze({ name, anzahl, minuten }) {
  const fensterMs = minuten * 60 * 1000;
  return function (req, res, next) {
    // req.ip liefert hinter Caddy die echte Adresse, weil server.js
    // `trust proxy` auf 1 setzt (ein Sprung: Caddy -> Backend). Steht hier im
    // Protokoll eine Docker-interne Adresse (172.x, 10.x), waere die
    // Einstellung falsch und ALLE Leute teilten sich einen Topf -- deshalb
    // wird die Adresse beim Ueberschreiten mitgeschrieben.
    const ip = req.ip || 'unbekannt';
    const schluessel = `${name}:${ip}`;
    const jetzt = Date.now();
    let eintrag = zaehler.get(schluessel);

    if (!eintrag || eintrag.fensterEnde <= jetzt) {
      eintrag = { anzahl: 0, fensterEnde: jetzt + fensterMs };
      zaehler.set(schluessel, eintrag);
    }
    eintrag.anzahl++;

    if (eintrag.anzahl > anzahl) {
      const restSekunden = Math.max(1, Math.ceil((eintrag.fensterEnde - jetzt) / 1000));
      console.warn(`[rateLimit] ${name} von ${ip} abgewiesen (${eintrag.anzahl}. Anfrage in ${minuten} Min.).`);
      res.set('Retry-After', String(restSekunden));
      return res.status(429).json({ error: 'rate_limited', retryAfter: restSekunden });
    }
    next();
  };
}

// Nur fuer Tests: setzt alle Zaehler zurueck.
export function _zaehlerLeeren() {
  zaehler.clear();
}
