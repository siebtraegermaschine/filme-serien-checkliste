/*
 * Web-Push ohne Fremdpaket (24.08.2026): Nachrichtenverschluesselung nach
 * RFC 8291 (aes128gcm, RFC 8188) und VAPID-Autorisierung nach RFC 8292 --
 * beides mit node:crypto. Bewusst selbst gebaut statt npm "web-push": Das
 * Projekt kommt mit acht Abhaengigkeiten aus, und das soll so bleiben
 * (gleiche Begruendung wie middleware/rateLimit.js). Die Korrektheit der
 * Verschluesselung ist gegen den offiziellen Testvektor aus RFC 8291
 * Anhang A abgesichert (test/webpush.test.js).
 *
 * Das VAPID-Schluesselpaar entsteht beim ersten Bedarf und liegt in
 * sport_meta (key 'push_vapid') -- kein Handgriff auf dem Server noetig,
 * und alle Prozesse/Neustarts nutzen dasselbe Paar (sonst wuerden
 * bestehende Abos ungueltig).
 */
import crypto from 'node:crypto';

export function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
export function b64urlDecode(s) {
  return Buffer.from(String(s), 'base64url');
}

// Unkomprimierter P-256-Punkt (0x04 || x || y, 65 Bytes) aus einem JWK --
// das Format, das PushManager.subscribe als applicationServerKey erwartet
// und das im aes128gcm-Kopf steht.
export function jwkZuRohpunkt(jwk) {
  return Buffer.concat([Buffer.from([4]), b64urlDecode(jwk.x), b64urlDecode(jwk.y)]);
}

export function erzeugeVapidJwks() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { privat: jwk, oeffentlich: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}

/* Nachricht nach RFC 8291 verschluesseln. p256dh/auth kommen base64url aus
   der PushSubscription des Browsers. fuerTest erlaubt, Absender-Schluessel
   und Salt festzunageln -- nur so ist der RFC-Testvektor nachrechenbar. */
export function verschluesselePush(klartext, p256dh, auth, fuerTest = {}) {
  const uaPub = b64urlDecode(p256dh);              // 65 Bytes, unkomprimiert
  const authSecret = b64urlDecode(auth);           // 16 Bytes
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('p256dh ist kein unkomprimierter P-256-Punkt');
  if (authSecret.length !== 16) throw new Error('auth hat nicht 16 Bytes');

  const salt = fuerTest.salt || crypto.randomBytes(16);
  const as = crypto.createECDH('prime256v1');
  if (fuerTest.asPrivat) as.setPrivateKey(fuerTest.asPrivat); else as.generateKeys();
  const asPub = as.getPublicKey();                 // 65 Bytes
  const ecdhSecret = as.computeSecret(uaPub);

  // Schluesselableitung: erst IKM aus ECDH-Geheimnis + auth_secret, daraus
  // Inhalts-Schluessel (16 Bytes) und Nonce (12 Bytes) -- RFC 8291 §3.3/3.4.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  // aes128gcm-Kopf (RFC 8188): salt || Datensatzgroesse || Laenge+Absender-Schluessel.
  const kopf = Buffer.alloc(21);
  salt.copy(kopf, 0);
  kopf.writeUInt32BE(4096, 16);
  kopf[20] = 65;

  // Ein einziger Datensatz: Klartext + Abschluss-Oktett 0x02, dann AES-128-GCM.
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const verschluesselt = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(klartext), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Buffer.concat([kopf, asPub, verschluesselt]);
}

/* VAPID-Autorisierungskopf (RFC 8292): ES256-signiertes JWT ueber den
   Ursprung des Push-Dienstes. exp deutlich unter den erlaubten 24 Stunden. */
export function vapidAuthorization(endpoint, vapidPrivatJwk, jetzt = Date.now()) {
  const aud = new URL(endpoint).origin;
  const kodiert = (obj) => b64url(Buffer.from(JSON.stringify(obj)));
  const inhalt = kodiert({ typ: 'JWT', alg: 'ES256' }) + '.' +
    kodiert({ aud, exp: Math.floor(jetzt / 1000) + 12 * 3600, sub: 'https://movietaste.de' });
  const key = crypto.createPrivateKey({ key: vapidPrivatJwk, format: 'jwk' });
  const signatur = crypto.sign('sha256', Buffer.from(inhalt), { key, dsaEncoding: 'ieee-p1363' });
  const oeffentlich = jwkZuRohpunkt(vapidPrivatJwk);
  return `vapid t=${inhalt}.${b64url(signatur)}, k=${b64url(oeffentlich)}`;
}

/* Eine Push-Nachricht zustellen. Rueckgabe ist der HTTP-Status des
   Push-Dienstes (0 bei Netzwerkfehler) -- 404/410 heisst "Abo ist tot,
   wegwerfen" und entscheidet der Aufrufer (lib/sportPush.js). */
export async function sendePush(abo, nutzlast, vapidPrivatJwk) {
  const body = verschluesselePush(JSON.stringify(nutzlast), abo.p256dh, abo.auth);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(abo.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        // TTL 30 Minuten: Eine Spielbeginn-Erinnerung, die den Anstoss
        // verpasst hat, soll nicht Stunden spaeter noch zugestellt werden.
        TTL: '1800',
        Urgency: 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: vapidAuthorization(abo.endpoint, vapidPrivatJwk),
      },
      body,
    });
    clearTimeout(t);
    // Antwortkoerper interessiert nicht -- aber aufraeumen, sonst haelt
    // undici die Verbindung offen.
    res.body?.cancel?.();
    return res.status;
  } catch {
    return 0;
  }
}

/* Schluesselpaar laden bzw. beim allerersten Mal anlegen -- wettlaufsicher
   ueber ON CONFLICT DO NOTHING plus erneutes Lesen. */
let vapidCache = null;
export async function ladeVapid(pool) {
  if (vapidCache) return vapidCache;
  const lesen = async () => {
    const { rows } = await pool.query(`SELECT value FROM sport_meta WHERE key = 'push_vapid'`);
    return rows[0] ? rows[0].value : null;
  };
  let jwks = await lesen();
  if (!jwks) {
    await pool.query(
      `INSERT INTO sport_meta (key, value) VALUES ('push_vapid', $1) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(erzeugeVapidJwks())]);
    jwks = await lesen();
  }
  vapidCache = jwks;
  return jwks;
}
