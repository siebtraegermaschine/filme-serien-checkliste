import { createAsyncRouter } from '../lib/asyncRouter.js';
import { ausListe } from '../lib/listenCache.js';
import { sprachWahl, regionWahl } from '../lib/i18n.js';
import { ladeListe } from './titles.js';
import { ladeStreaming } from './streaming.js';

const router = createAsyncRouter();

/* Kleine Erstladung: der kuratierte Katalog plus die bekanntesten Titel aus
   Discovery/Streaming. Damit zeichnet die Startseite, waehrend die komplette
   Liste (/api/titles + /api/streaming, rund 8 MB gepackt) erst danach kommt. */
const TOP_TITEL = 600;
const TOP_FILME = 500;
const TOP_SERIEN = 300;

const nachBeliebtheit = (feld) => (a, b) => (b[feld] || 0) - (a[feld] || 0);

export function startkatalogSchluessel(lang, region) {
  return `start:${lang}:${region}`;
}

export async function ladeStartkatalog(lang, region) {
  const [alle, streamDoc] = await Promise.all([
    ladeListe({ source: 'catalog,discovery,streaming', withPlot: false, lang, region }),
    ladeStreaming(lang, region),
  ]);
  const katalog = alle.filter((r) => r.source === 'catalog');
  const rest = alle.filter((r) => r.source !== 'catalog')
    .sort(nachBeliebtheit('voteCount')).slice(0, TOP_TITEL);
  return {
    combinedRows: [...katalog, ...rest],
    streamDoc: {
      ...streamDoc,
      filme: streamDoc.filme.sort(nachBeliebtheit('vc')).slice(0, TOP_FILME),
      serien: streamDoc.serien.sort(nachBeliebtheit('vc')).slice(0, TOP_SERIEN),
    },
  };
}

router.get('/', async (req, res) => {
  const lang = sprachWahl(req.query.lang);
  const region = regionWahl(req.query.region);
  await ausListe(req, res, startkatalogSchluessel(lang, region), () => ladeStartkatalog(lang, region));
});

export default router;
