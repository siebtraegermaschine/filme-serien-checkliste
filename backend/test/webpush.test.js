/* Tests fuer die selbstgebaute Web-Push-Verschluesselung (lib/webpush.js):
 * Der offizielle Testvektor aus RFC 8291 Anhang A muss Byte fuer Byte
 * herauskommen -- damit ist die aes128gcm-Kette (ECDH, HKDF, AES-GCM,
 * Kopfformat) gegen die Norm abgesichert, nicht nur gegen sich selbst.
 * Dazu VAPID-Signaturpruefung mit Bordmitteln. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verschluesselePush, vapidAuthorization, erzeugeVapidJwks, jwkZuRohpunkt, b64url, b64urlDecode } from '../lib/webpush.js';

// RFC 8291, Anhang A -- Eingaben.
const KLARTEXT = 'When I grow up, I want to be a watermelon';
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
// Erwartete Nachricht: 86-Byte-Kopf + Geheimtext (RFC 8291, Abschnitt 5 / Anhang A).
const ERWARTET_KOPF = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const ERWARTET_CIPHER = '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ';

test('RFC-8291-Testvektor: Kopf und Geheimtext stimmen Byte fuer Byte', () => {
  const nachricht = verschluesselePush(KLARTEXT, UA_PUBLIC, AUTH, {
    salt: b64urlDecode(SALT),
    asPrivat: b64urlDecode(AS_PRIVATE),
  });
  assert.equal(b64url(nachricht.subarray(0, 86)), ERWARTET_KOPF);
  assert.equal(b64url(nachricht.subarray(86)), ERWARTET_CIPHER);
});

test('abgeleiteter Absender-Schluessel im Kopf entspricht as_public', () => {
  const nachricht = verschluesselePush(KLARTEXT, UA_PUBLIC, AUTH, {
    salt: b64urlDecode(SALT),
    asPrivat: b64urlDecode(AS_PRIVATE),
  });
  assert.equal(b64url(nachricht.subarray(21, 86)), AS_PUBLIC);
});

test('kaputte Abo-Schluessel werden abgewiesen statt Muell zu verschluesseln', () => {
  assert.throws(() => verschluesselePush('x', 'AAAA', AUTH));
  assert.throws(() => verschluesselePush('x', UA_PUBLIC, 'AAAA'));
});

test('VAPID: Signatur verifizierbar, Claims korrekt, Schluessel passt zusammen', () => {
  const jwks = erzeugeVapidJwks();
  const kopfzeile = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123', jwks.privat, 1_756_000_000_000);
  const m = kopfzeile.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'Kopfzeile hat das vapid t=..., k=...-Format');
  const [kopf, claims, signatur] = m[1].split('.');
  const inhalt = JSON.parse(b64urlDecode(claims));
  assert.equal(inhalt.aud, 'https://fcm.googleapis.com');
  assert.ok(inhalt.exp > 1_756_000_000 && inhalt.exp <= 1_756_000_000 + 24 * 3600);
  assert.deepEqual(JSON.parse(b64urlDecode(kopf)), { typ: 'JWT', alg: 'ES256' });
  // Signatur mit dem oeffentlichen Schluessel pruefen (ieee-p1363 wie im JWS).
  const publicKey = crypto.createPublicKey({ key: jwks.oeffentlich, format: 'jwk' });
  const gueltig = crypto.verify('sha256', Buffer.from(`${kopf}.${claims}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64urlDecode(signatur));
  assert.equal(gueltig, true);
  // k= ist derselbe Schluessel als Rohpunkt.
  assert.equal(m[2], b64url(jwkZuRohpunkt(jwks.privat)));
});

test('Rundreise: ein Browser-artiger Empfaenger kann entschluesseln', () => {
  // Empfaengerseite nachgebaut (RFC 8291 aus UA-Sicht): eigenes Schluesselpaar
  // + auth_secret, dann die Nachricht aus verschluesselePush aufmachen.
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const nachricht = verschluesselePush('{"titel":"⚽ Test"}', b64url(ua.getPublicKey()), b64url(authSecret));

  const salt = nachricht.subarray(0, 16);
  const asPub = nachricht.subarray(21, 86);
  const ecdhSecret = ua.computeSecret(asPub);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const geheim = nachricht.subarray(86);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(geheim.subarray(-16));
  const klar = Buffer.concat([decipher.update(geheim.subarray(0, -16)), decipher.final()]);
  assert.equal(klar[klar.length - 1], 2);
  assert.equal(klar.subarray(0, -1).toString(), '{"titel":"⚽ Test"}');
});
