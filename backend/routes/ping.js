/* Cookieloser Seiten-Ping aus der App (16.09.2026, nach dem Vorbild von
   CouchUltras).

   Das Frontend meldet jeden Ansichtswechsel (Start, Filme, Serien, Kino)
   hierher. Gezaehlt wird ueber die cookielose Tageskennung
   (lib/tageskennung.js), genau wie die SEO-Seiten am Server -- so gibt es
   fuer App und SEO-Seiten dieselbe Groesse "Geraete je Tag". Das
   Geraete-Cookie mt_anon (middleware/anonId.js) kommt zusaetzlich mit,
   damit Ereignisse desselben Geraets zusammenpassen.

   props sind reine Aufzaehlungen: Pfad aus einer festen Liste, Herkunft
   als Kategorie (die Referer-Adresse wird geprueft und verworfen),
   Geraetetyp, Crawler-Kennzeichen. Antwort immer 204. */
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { track } from '../lib/track.js';
import { tageskennung } from '../lib/tageskennung.js';
import { herkunftKategorie, geraetTyp, istBot } from '../lib/herkunft.js';

const router = createAsyncRouter();
const GRENZE = mengenGrenze({ name: 'ping', anzahl: 300, minuten: 60 });

// Die Ansichten der App als Pfade -- was das Frontend nicht aus dieser
// Liste meldet, wird verworfen (kein Freitext in der Datenbank).
export const APP_PFADE = ['/', '/#filme', '/#serien', '/#kino'];
export const EIGENE_HOSTS = ['movietaste.de', 'moviematch.app'];

router.post('/', GRENZE, async (req, res) => {
  const { pfad, ref } = req.body || {};
  if (APP_PFADE.includes(pfad)) {
    const ua = req.get('user-agent') || '';
    await track('seite_aufruf', {
      userId: req.session?.userId ?? null,
      anonId: req.anonId,
      tagesId: await tageskennung(req),
      props: {
        typ: 'app',
        pfad,
        bot: istBot(ua),
        geraet: geraetTyp(ua),
        herkunft: herkunftKategorie(typeof ref === 'string' ? ref.slice(0, 2000) : '',
                                    [...EIGENE_HOSTS, req.hostname]),
      },
    });
  }
  res.status(204).end();
});

export default router;
