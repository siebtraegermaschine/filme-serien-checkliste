import crypto from 'node:crypto';

// Konstant-zeitiger Vergleich zweier Geheimnisse (Ingest-Secrets).
//
// Ein einfaches `a !== b` bricht beim ersten abweichenden Zeichen ab -- die
// Vergleichsdauer haengt damit davon ab, wie viele Zeichen am Anfang stimmen,
// und verraet ueber viele Versuche das Geheimnis Zeichen fuer Zeichen. Bei
// Server-zu-Server-Tokens ist das Restrisiko klein, aber der Schutz kostet
// nichts.
//
// Beide Seiten werden zuerst per SHA-256 gehasht: So bekommt timingSafeEqual
// immer gleich lange Puffer (sonst wirft es), und schon die Laenge des
// erwarteten Werts sickert nicht ueber einen fruehen Abbruch durch.
export function geheimnisStimmt(geliefert, erwartet) {
  if (typeof geliefert !== 'string' || typeof erwartet !== 'string' || !erwartet) {
    return false;
  }
  const a = crypto.createHash('sha256').update(geliefert).digest();
  const b = crypto.createHash('sha256').update(erwartet).digest();
  return crypto.timingSafeEqual(a, b);
}
