import test from 'node:test';
import assert from 'node:assert/strict';
import { faktenVerdachtDatensatz, formatFehlerPerson } from '../scripts/seo-personen-check.mjs';

const kopf = (bio, extra = '') => `Name: Test Person
Rolle: Schauspieler/in
Geburtsdatum: 1970-05-04
Biografie: ${bio}
Anzahl Titel im Katalog: 5
Zeitspanne der Titel: 2013 bis 2026 (13 Jahre)
Abstand Geburtsjahr zu erstem Titel: 43 Jahre
Abstand Geburtsjahr zu letztem Titel: 56 Jahre
Genres: Komödie, Horror (2)
Davon Filme: 5, Serien: 0
Unsere Bewertungen: 6.4, 6.2, 6.2, 6.0, 5.8 (Schnitt 6.1)
Titel: A (2013); B (2019); C (2014); D (2026); E (2017)${extra}`;

const pruefe = (text, bio) => faktenVerdachtDatensatz(text, kopf(bio));

// --- Fehlalarme, die behoben sein muessen ---------------------------------

test('abgeleitete Bewertungszahlen (Spanne, Schwellen) sind keine Erfindung', () => {
  const t = 'Alle fünf Bewertungen liegen über 5,5 und unter 6,5 von 10. Die Spanne beträgt 0,6 Punkte.';
  assert.deepEqual(pruefe(t, 'An actor.'), []);
});

test('abgeleitete Anzahl (n minus eins) und Genres je Titel sind keine Erfindung', () => {
  assert.deepEqual(pruefe('Von fünf Titeln liegen die übrigen 4 darunter, im Schnitt 0,4 Genres je Titel.', 'An actor.'), []);
});

test('englisches Zahlwort und Tausendertrenner in der Quelle belegen die Ziffer', () => {
  assert.deepEqual(pruefe('Er hatte mehr als 250 Auftritte.', 'He had more than two hundred fifty appearances.'), []);
  assert.deepEqual(pruefe('Sie wurde aus 1.500 Bewerberinnen gewählt.', 'She was chosen from 1,500 candidates.'), []);
});

test('Jahreskuerzel mit Apostroph in der Quelle belegt das Jahr', () => {
  assert.deepEqual(pruefe('1982 folgte das zweite Album.', 'The second album followed in \'82.'), []);
});

test('Oscar/nominiert sind durch Academy Award / nominated in der Quelle belegt', () => {
  const bio = 'His film was nominated for the Academy Award for Best Foreign Film.';
  assert.deepEqual(pruefe('Sein Film wurde für den Oscar als bester fremdsprachiger Film nominiert.', bio), []);
});

test('Dreharbeiten, Produktionsfirma, Kritiker, Kinder, Sohn sind durch englische Entsprechung belegt', () => {
  assert.deepEqual(pruefe('Bei den Dreharbeiten lernte er einen Filmemacher kennen.', 'During the filming of it he met a filmmaker.'), []);
  assert.deepEqual(pruefe('Sie gründeten die Produktionsfirma Derives.', 'They founded the production company Derives.'), []);
  assert.deepEqual(pruefe('Er ist Regisseur und Kritiker.', 'He is a director and critic.'), []);
  assert.deepEqual(pruefe('Seine Filme drehen sich um Kinder.', 'His films are based around children.'), []);
  assert.deepEqual(pruefe('Er kam als Sohn italienischer Eltern zur Welt.', 'Born in Glasgow to Italian parents.'), []);
});

// --- Gegenfaelle: muessen weiterhin beanstandet werden ---------------------

test('erfundene Auszeichnung ohne Beleg wird beanstandet', () => {
  assert.ok(pruefe('Er gewann den Oscar als bester Nebendarsteller.', 'An actor from Spain.').some((v) => v.startsWith('Auszeichnung')));
  assert.ok(pruefe('Sie wurde für den Emmy nominiert.', 'An actress.').some((v) => v.startsWith('Auszeichnung')));
});

test('Privatleben ohne Beleg wird beanstandet', () => {
  assert.ok(pruefe('Er ist verheiratet und hat zwei Kinder.', 'An actor.').some((v) => v.startsWith('Privatleben')));
  assert.ok(pruefe('Seine Tochter ist ebenfalls Schauspielerin.', 'An actor.').some((v) => v.startsWith('Privatleben')));
});

test('Werturteil und Karriereeinordnung ohne Beleg werden beanstandet', () => {
  assert.ok(pruefe('Er gilt als eine der besten Stimmen seiner Zeit.', 'An actor.').some((v) => v.startsWith('Werturteil')));
  assert.ok(pruefe('Er prägte eine ganze Generation von Schauspielern.', 'An actor.').some((v) => v.startsWith('Karriereeinordnung')));
});

test('Kontroverse ohne Beleg wird beanstandet', () => {
  assert.ok(pruefe('Nach einem Skandal zog er sich zurück.', 'An actor.').some((v) => v.startsWith('Kontroverse')));
});

test('erfundene Zahlen werden beanstandet, auch wenn Ableitungen erlaubt sind', () => {
  assert.ok(pruefe('Er spielte in 40 Filmen.', 'An actor.').some((v) => v.startsWith('Zahl ohne Beleg')));
  assert.ok(pruefe('Seine beste Bewertung liegt bei 8,7 von 10.', 'An actor.').some((v) => v.startsWith('Zahl ohne Beleg')));
  assert.ok(pruefe('Er debütierte 1999.', 'An actor.').some((v) => v.startsWith('Zahl ohne Beleg')));
});

test('Mischrollen: eine im Datensatz nicht vorkommende Person im Regie-Kontext wird beanstandet (Robin-Wright-Fall)', () => {
  // Bei Mischrollen (Schauspielerin, die auch Regie fuehrte) darf der Text keine
  // Regie-Titel aus fremden Quellen nennen; hier: Name im Regie-Kontext fehlt in der Quelle.
  assert.ok(pruefe('Die Regie führte Jane Doe selbst.', 'An actress.').some((v) => v.startsWith('Beteiligte')));
  assert.ok(pruefe('Der Film, gespielt von Max Mustermann, entstand.', 'An actress.').some((v) => v.startsWith('Beteiligte')));
});

test('Zahl aus anderer Zeile der Quelle wird nicht mit Ableitung verwechselt: 7,5 bei Bewertungen 6,4-5,8', () => {
  // 7,5 liegt weder in der Quelle noch zwischen den abgeleiteten Schwellen
  assert.ok(pruefe('Eine Bewertung von 7,5 ragt heraus.', 'An actor.').some((v) => v.startsWith('Zahl ohne Beleg')));
});

// --- Formatgrenzen ---------------------------------------------------------

const absatz = (n) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ');
const text = (n) => `### Werdegang\n${absatz(n)}\n\n### Filmografie bei uns\nx\n\n### Einordnung\ny`;

test('Formatpruefung: Wortzahl, Ueberschriften, Aufzaehlung, Fettschrift', () => {
  assert.deepEqual(formatFehlerPerson(text(230)), []);
  assert.ok(formatFehlerPerson(text(100)).some((f) => f.startsWith('zu kurz')));
  assert.ok(formatFehlerPerson(text(400)).some((f) => f.startsWith('zu lang')));
  assert.ok(formatFehlerPerson('### Werdegang\na\n### Einordnung\nb').some((f) => f.startsWith('Ueberschriften')));
  assert.ok(formatFehlerPerson(text(230) + '\n- Punkt').some((f) => f.includes('Aufzaehlung')));
  assert.ok(formatFehlerPerson(text(230) + ' **fett**').some((f) => f.includes('Fettschrift')));
});
