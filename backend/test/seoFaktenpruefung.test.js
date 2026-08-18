// Sichert die mechanische Faktenpruefung ab (Christian, 18.08.2026).
//
// Sie ist die erste von zwei Kontrollen fuer maschinell erzeugte Titeltexte:
// Was nicht im Datensatz steht, darf nicht im Text stehen. Erfasst werden
// Zahlen, als Beteiligte genannte Personen und Wendungen, die typischerweise
// eine unbelegte Behauptung einleiten.
//
// Die Tests halten beide Richtungen fest, weil beide Fehler teuer sind:
// Was durchrutscht, landet als erfundene Tatsache auf einer Seite. Was zu
// Unrecht anschlaegt, blockiert brauchbare Texte -- ein erster Entwurf meldete
// 36 von 36 Texten als verdaechtig und war damit wertlos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeGegenQuelle, formatFehler } from '../scripts/seo-batch.mjs';

const QUELLE = [
  'Titel (deutsch): Testfilm',
  'Erscheinungsjahr: 2010',
  'Regie: Anna Beispiel',
  'Besetzung: Max Muster, Lea Probe',
  'Genres: Drama, Thriller',
  'Durchschnittsbewertung: 7.2 von 10',
  'Abgegebene Stimmen: 4000',
  'Inhaltsangabe: Ein Auftrag ueber 300 Millionen Dollar veraendert alles.',
].join('\n');
const KENNZAHLEN = { year: 2010, rating: '7.2', voteCount: '4000' };
const pruefe = (t) => pruefeGegenQuelle(t, QUELLE, KENNZAHLEN);

test('erfundene Regie wird erkannt', () => {
  assert.ok(pruefe('Regie führte Steven Spielberg.').length);
});

test('belegte Regie wird nicht beanstandet', () => {
  assert.deepEqual(pruefe('Regie führte Anna Beispiel, vor der Kamera stand Max Muster.'), []);
});

test('erfundene Auszeichnung, Geschaeftszahl, Drehort, Rezeption und Werkbezug werden erkannt', () => {
  for (const satz of [
    'Der Film gewann den Oscar.',
    'Weltweit spielte er 240 Millionen Dollar ein.',
    'Gedreht wurde in Neuseeland.',
    'Rotten Tomatoes weist 88 Prozent aus.',
    'Der Film basiert auf dem Roman eines bekannten Autors.',
  ]) assert.ok(pruefe(satz).length, satz);
});

// --- Gegenrichtung: was NICHT anschlagen darf ------------------------------

test('Zahlen aus dem Datensatz sind belegt, auch mit deutschem Komma', () => {
  // Der Datensatz fuehrt 7.2, deutscher Fliesstext schreibt 7,2.
  assert.deepEqual(pruefe('Die Bewertung liegt bei 7,2 von 10 bei 4000 Stimmen.'), []);
});

test('Zahlen aus der Inhaltsangabe sind belegt', () => {
  // "300 Millionen Dollar" ist hier der Auftragswert, nicht das Einspielergebnis.
  assert.deepEqual(pruefe('Der Auftrag über 300 Millionen Dollar veraendert alles.'), []);
});

test('gerundeter Jahresabstand wird geduldet', () => {
  const abstand = new Date().getFullYear() - 2010;
  assert.deepEqual(pruefe(`Seit dem Erscheinen sind gut ${abstand - 1} Jahre vergangen.`), []);
  assert.deepEqual(pruefe(`Seit dem Erscheinen sind ${abstand} Jahre vergangen.`), []);
});

test('Satzende hinter einem Namen wird nicht mitgelesen', () => {
  // "Anna Beispiel. Die" darf nicht als unbelegter Name gelten.
  assert.deepEqual(pruefe('Regie führte Anna Beispiel. Die Besetzung ist überschaubar.'), []);
});

test('grossgeschriebene deutsche Substantive sind keine Eigennamen', () => {
  // Der erste Entwurf scheiterte genau hier: Im Deutschen steht hinter jedem
  // Satzanfang ein grossgeschriebenes Wort, gefolgt von einem Substantiv.
  for (const satz of [
    'Die Altersfreigabe ist nicht angegeben.',
    'Der Thriller lebt von seiner Anlage.',
    'Zwei Widersacher stehen sich gegenüber.',
    'Die Genres Drama und Thriller ergeben eine klare Richtung.',
  ]) assert.deepEqual(pruefe(satz), [], satz);
});

test('unbelegte Zahl faellt auf', () => {
  assert.ok(pruefe('Vor 30 Jahren geschah etwas.').length);
});

// --- Format ---------------------------------------------------------------

test('Format verlangt genau die vier Ueberschriften', () => {
  const rumpf = 'Wort '.repeat(80);   // 4 x 80 = 320 Woerter, im erlaubten Bereich
  const gut = ['### Worum es geht', rumpf, '### Entstehungsgeschichte', rumpf,
    '### Hinter den Kulissen', rumpf, '### Einordnung & Wirkung', rumpf].join('\n\n');
  assert.deepEqual(formatFehler(gut, 'de-de'), []);
  assert.ok(formatFehler(gut.replace('### Hinter den Kulissen', '### Sonstiges'), 'de-de').length);
});
