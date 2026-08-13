/* Nimmt die zwei client-seitigen Trichter-Schritte entgegen (besuch,
   erste-markierung) -- anonym, ohne Body ausser dem Schrittnamen, Antwort
   immer 204. Die serverseitigen Schritte (konto, zehn-titel) laufen NICHT
   hier, sondern direkt in auth.js/progress.js -- der Client kann sie also
   weder ausloesen noch aufblasen.

   Die Mengengrenze deckelt das Hochtreiben der Zaehler je IP; mehr ist
   nicht noetig, weil hier nichts gelesen werden kann und nichts Personen-
   bezogenes entsteht. */
import { mengenGrenze } from '../middleware/rateLimit.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { metrikZaehlen, CLIENT_SCHRITTE } from '../lib/metrik.js';

const router = createAsyncRouter();
const GRENZE = mengenGrenze({ name: 'metrik', anzahl: 30, minuten: 60 });

router.post('/', GRENZE, async (req, res) => {
  const schritt = (req.body || {}).schritt;
  if (CLIENT_SCHRITTE.includes(schritt)) await metrikZaehlen(schritt);
  // Auch bei unbekanntem Schritt 204: Es gibt nichts, was ein Angreifer aus
  // der Unterscheidung lernen soll, und der Client wertet die Antwort eh
  // nicht aus.
  res.status(204).end();
});

export default router;
