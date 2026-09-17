// Sichert die Batch-API-Bausteine von seo-batch.mjs ab, die sich ohne
// Netzwerk und ohne Datenbank pruefen lassen: Kostenrechnung, custom_id-
// Kodierung und das Parsen der JSONL-Ergebnisdatei. Die mechanische
// Format-/Faktenpruefung selbst ist bereits in seoFaktenpruefung.test.js
// abgedeckt (Christian, 18.08.2026) und hier unveraendert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kostenBerechnen, customId, schluesselAusCustomId, ergebnisZeilenLesen, statusLesen, PREISE } from '../scripts/seo-batch.mjs';

test('kostenBerechnen: 1 Mio. Basis-Eingabetoken kosten den halbierten Batchpreis', () => {
  const dollar = kostenBerechnen({ input_tokens: 1_000_000 }, 'claude-sonnet-5');
  assert.equal(dollar, 1); // Tabellenpreis Batch-Eingabe Sonnet 5: 1 $/MTok
});

test('kostenBerechnen: Cache-Lesen kostet 0,10 $/MTok (Batch, Sonnet 5)', () => {
  const dollar = kostenBerechnen({ cache_read_input_tokens: 1_000_000 }, 'claude-sonnet-5');
  assert.equal(dollar, 0.10);
});

test('kostenBerechnen: 1h-Cache-Schreiben kostet 2 $/MTok (Batch, Sonnet 5)', () => {
  const dollar = kostenBerechnen({ cache_creation_input_tokens: 1_000_000 }, 'claude-sonnet-5');
  assert.equal(dollar, 2);
});

test('kostenBerechnen: Ausgabe kostet 5 $/MTok (Batch, Sonnet 5)', () => {
  const dollar = kostenBerechnen({ output_tokens: 1_000_000 }, 'claude-sonnet-5');
  assert.equal(dollar, 5);
});

test('kostenBerechnen: realistischer Einzeltext bleibt im erwarteten Bereich', () => {
  // Ueberschlag aus PLAN-KOSTEN.md: ~3.000 Token gecachte Anweisung (Lesen),
  // ~1.000 Token Datensatz (voll), ~900 Token Ausgabe.
  const dollar = kostenBerechnen(
    { input_tokens: 1000, cache_read_input_tokens: 3000, output_tokens: 900 },
    'claude-sonnet-5'
  );
  assert.ok(dollar > 0 && dollar < 0.02, `unerwartete Kosten je Text: ${dollar}`);
});

test('kostenBerechnen: unbekanntes Modell bricht ab statt stillschweigend 0 zu rechnen', () => {
  assert.throws(() => kostenBerechnen({ input_tokens: 100 }, 'claude-irgendwas'));
});

test('PREISE deckt das Standardmodell ab', () => {
  assert.ok(PREISE['claude-sonnet-5']);
});

test('customId/schluesselAusCustomId: Hin- und Rueckweg fuer Filme und Serien', () => {
  for (const schluessel of ['movie:12345', 'series:987']) {
    const id = customId(schluessel);
    assert.match(id, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.equal(schluesselAusCustomId(id), schluessel);
  }
});

test('statusLesen: fehlende Datei liefert leeren Status', () => {
  const s = statusLesen(path.join(os.tmpdir(), `seo-status-fehlt-${Date.now()}.json`));
  assert.deepEqual(s, { ausgegeben: 0, aufrufe: 0, texte: 0, versucht: [], aktuellerBatch: null });
});

// Nachgereicht, nachdem ein per `docker -v` vorab angelegter (leerer) Bind-Mount
// beim JSON.parse einer leeren Datei abgestuerzt ist (Christian, 17.09.2026).
test('statusLesen: leere Datei (z. B. vorab per touch angelegt) liefert leeren Status statt Absturz', () => {
  const pfad = path.join(os.tmpdir(), `seo-status-leer-${Date.now()}.json`);
  fs.writeFileSync(pfad, '');
  const s = statusLesen(pfad);
  assert.deepEqual(s, { ausgegeben: 0, aufrufe: 0, texte: 0, versucht: [], aktuellerBatch: null });
  fs.unlinkSync(pfad);
});

test('statusLesen: vorhandener Status wird unveraendert zurueckgegeben', () => {
  const pfad = path.join(os.tmpdir(), `seo-status-voll-${Date.now()}.json`);
  const original = { ausgegeben: 1.23, aufrufe: 5, texte: 4, versucht: ['movie:1'], aktuellerBatch: null };
  fs.writeFileSync(pfad, JSON.stringify(original));
  assert.deepEqual(statusLesen(pfad), original);
  fs.unlinkSync(pfad);
});

test('ergebnisZeilenLesen: JSONL mit leeren Zeilen wird korrekt zerlegt', () => {
  const jsonl = [
    JSON.stringify({ custom_id: 'movie-1', result: { type: 'succeeded' } }),
    '',
    JSON.stringify({ custom_id: 'movie-2', result: { type: 'errored', error: { error: { message: 'x' } } } }),
    '',
  ].join('\n');
  const zeilen = ergebnisZeilenLesen(jsonl);
  assert.equal(zeilen.length, 2);
  assert.equal(zeilen[0].custom_id, 'movie-1');
  assert.equal(zeilen[1].result.type, 'errored');
});
