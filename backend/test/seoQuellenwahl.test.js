// Sichert die Wahl der Inhaltsangabe fuer maschinell erzeugte Titeltexte ab
// (18.08.2026).
//
// inhaltsangabe() waehlt aus deutschem Plot, englischer Fassung und den
// Uebersetzungen die beste Quelle. "Beste" heisst: lang genug, moeglichst nah
// an der Zielsprache und moeglichst vollstaendig -- in dieser Reihenfolge der
// Zugestaendnisse. Rund ein Viertel der TMDB-Texte endet auf "..." oder ganz
// ohne Satzzeichen; das ist dort Schreibstil, kein Importfehler (Beleg:
// scripts/plot-quellen-pruefen.mjs). Fuer uns bleibt es die schlechtere Quelle,
// weil an der Bruchstelle Tatsachen fehlen und die Faktenregel verbietet, sie
// zu ergaenzen.
//
// Die Tests halten beide Richtungen fest: dass Vollstaendigkeit die
// Sprachnaehe schlaegt, und dass sie es nicht um jeden Preis tut -- eine
// deutlich kuerzere Quelle bleibt liegen, auch wenn sie sauber endet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inhaltsangabe, istFragment } from '../scripts/seo-batch.mjs';

const lang = (n, ende) => 'Wort '.repeat(Math.max(1, Math.round((n - ende.length) / 5))) + ende;

test('Fragmente werden als solche erkannt, vollstaendige Saetze nicht', () => {
  assert.ok(istFragment('Er bricht mitten im Satz ab...'));
  assert.ok(istFragment('Er bricht mitten im Satz ab…'));
  assert.ok(istFragment('Ein Satz ganz ohne Schlusszeichen'));
  assert.ok(!istFragment('Ein sauber beendeter Satz.'));
  assert.ok(!istFragment('Und wer gewinnt?'));
  assert.ok(!istFragment('Er ruft: "Lauf!"'));
  assert.ok(!istFragment(''));
});

test('vollstaendige Quelle schlaegt das laengere Fragment im selben Band', () => {
  const t = {
    plot: lang(700, 'und dann geschieht etwas...'),
    overview_en: lang(600, 'and everyone finally goes home.'),
    uebersetzungen: {},
  };
  assert.equal(inhaltsangabe(t, 'de-de'), t.overview_en);
});

test('deutlich kuerzere vollstaendige Quelle bleibt liegen', () => {
  // 300 von 900 Zeichen sind unter der 0.67-Schwelle: zu viel Verlust.
  const t = {
    plot: lang(900, 'und dann geschieht etwas...'),
    overview_en: lang(300, 'and everyone finally goes home.'),
    uebersetzungen: {},
  };
  assert.equal(inhaltsangabe(t, 'de-de'), t.plot);
});

test('bei gleicher Vollstaendigkeit gewinnt weiterhin die Sprachnaehe', () => {
  const t = {
    plot: lang(700, 'und alle gehen nach Hause.'),
    overview_en: lang(720, 'and everyone finally goes home.'),
    uebersetzungen: {},
  };
  assert.equal(inhaltsangabe(t, 'de-de'), t.plot);
});

test('sind im Band nur Fragmente, bleibt es bei der bisherigen Wahl', () => {
  const t = {
    plot: lang(700, 'und dann geschieht etwas...'),
    overview_en: lang(680, 'and then something happens...'),
    uebersetzungen: {},
  };
  assert.equal(inhaltsangabe(t, 'de-de'), t.plot);
});

test('Zielsprache gewinnt, wenn sie vollstaendig ist', () => {
  const t = {
    plot: lang(700, 'und dann geschieht etwas...'),
    overview_en: lang(690, 'and everyone finally goes home.'),
    uebersetzungen: { fr: { ov: lang(710, 'et tout le monde rentre.') } },
  };
  assert.equal(inhaltsangabe(t, 'fr-fr'), t.uebersetzungen.fr.ov);
});

test('ohne jede Quelle kommt null zurueck', () => {
  assert.equal(inhaltsangabe({ uebersetzungen: {} }, 'de-de'), null);
});
