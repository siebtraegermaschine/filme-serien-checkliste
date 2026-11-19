import { bearerAus, pruefeToken } from '../lib/tokenAuth.js';

// Setzt req.userId (und req.tokenId bei Bearer) fuer ALLE /api-Routen, auch die
// ohne Anmeldepflicht. Bearer-Token der Apps gelten vor dem Cookie; ohne Token
// bleibt es bei der Cookie-Sitzung, das Web-Verhalten aendert sich nicht.
// Ein ungueltiger Bearer faellt NICHT auf das Cookie zurueck: Die App soll
// abgemeldet werden, nicht still als jemand anderes weiterlaufen.
export async function authKontext(req, res, next) {
  try {
    const klartext = bearerAus(req);
    if (klartext !== null) {
      const t = await pruefeToken(klartext);
      if (t) { req.userId = t.userId; req.tokenId = t.id; }
    } else if (req.session?.userId) {
      req.userId = req.session.userId;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  next();
}
