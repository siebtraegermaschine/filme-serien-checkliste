/* Schmale Route fuer die wenigen KPI-Ereignisse, die zwingend clientseitig
   entstehen (App-Oeffnung, Klicks, Gast-Teilnahme). Alles andere -- Konto,
   Einladung versendet/angenommen, Movie-Night -- wird direkt serverseitig
   getrackt und laesst sich hier weder ausloesen noch aufblasen.

   Jedes erlaubte Ereignis hat eine eigene, strenge props-Pruefung: nur
   Aufzaehlungswerte und Nummern, niemals Freitext (docs/kpi.md, DSGVO-Regeln).
   Unbekannte Namen und unpassende props werden still verworfen -- Antwort
   immer 204, wie bei /api/metrik gibt es hier nichts zu lernen. */
import crypto from 'node:crypto';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { track } from '../lib/track.js';

const router = createAsyncRouter();
const GRENZE = mengenGrenze({ name: 'events', anzahl: 120, minuten: 60 });

const PLATTFORMEN = ['ios', 'android', 'desktop'];
const TOKEN_RE = /^[a-f0-9]{64}$/;

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/* Je Ereignis: props pruefen und in die gespeicherte Form bringen. Rueckgabe
   null = verwerfen. Der Einladungs-Rohtoken wird sofort zum Hash -- gespeichert
   wird wie in user_link_invites nie der einloesbare Wert. */
const PRUEFER = {
  app_opened(props) {
    const platform = PLATTFORMEN.includes(props.platform) ? props.platform : 'desktop';
    return { platform };
  },
  invite_opened(props) {
    if (typeof props.token !== 'string' || !TOKEN_RE.test(props.token)) return null;
    return { invite_id: tokenHash(props.token) };
  },
  // Nur die GAST-Teilnahme kommt vom Client; das Annehmen mit Konto trackt
  // routes/links.js serverseitig. guest wird deshalb hier erzwungen.
  invite_accepted(props) {
    if (typeof props.token !== 'string' || !TOKEN_RE.test(props.token)) return null;
    return { invite_id: tokenHash(props.token), guest: true };
  },
  affiliate_click(props) {
    const provider = Number(props.provider);
    const titleId = Number(props.title_id);
    if (!Number.isInteger(provider) || provider <= 0) return null;
    if (!Number.isInteger(titleId) || titleId <= 0) return null;
    return { provider, title_id: titleId };
  },
};

router.post('/', GRENZE, async (req, res) => {
  const { name, props } = req.body || {};
  const pruefen = PRUEFER[name];
  if (pruefen) {
    const geprueft = pruefen(props && typeof props === 'object' ? props : {});
    if (geprueft) {
      await track(name, {
        userId: req.session?.userId ?? null,
        anonId: req.anonId,
        props: geprueft,
      });
    }
  }
  res.status(204).end();
});

export default router;
