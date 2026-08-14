/* Anonyme Geraetekennung fuer die KPI-Erfassung (docs/kpi.md).

   Ein zufaelliger 32-Hex-Wert im Cookie mt_anon -- KEIN Personenbezug: keine
   IP, keine Kontonummer, nicht aus anderen Werten ableitbar. Er verbindet
   Ereignisse desselben Geraets (dau/wau/mau, Retention, Gast-zu-Konto), mehr
   nicht. Als Cookie statt localStorage, damit auch serverseitig ausgeloeste
   Ereignisse (Registrierung, Einladung angenommen) das Geraet kennen, ohne
   dass das Frontend den Wert je anfassen muss.

   httpOnly, weil kein Skript ihn lesen muss. Laufzeit sechs Monate -- so lange
   sagt es die Datenschutzerklaerung (Abschnitt 4) zu, und laenger braucht es
   keine Kennzahl: Die weiteste Rueckschau ist d30 (Kohorte plus 30 Tage
   Beobachtung, gut fuenf Wochen). Faellt das Setzen aus (Cookies blockiert),
   traegt jede Anfrage eine frische Kennung -- die Ereignisse bleiben gueltig,
   nur die Wiedererkennung des Geraets entfaellt. */
import crypto from 'node:crypto';

const COOKIE_NAME = 'mt_anon';
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const WERT_RE = /(?:^|;\s*)mt_anon=([a-f0-9]{32})(?:;|$)/;

export function anonId(req, res, next) {
  const gefunden = WERT_RE.exec(req.headers.cookie || '');
  if (gefunden) {
    req.anonId = gefunden[1];
  } else {
    req.anonId = crypto.randomBytes(16).toString('hex');
    res.cookie(COOKIE_NAME, req.anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: MAX_AGE_MS,
    });
  }
  next();
}
