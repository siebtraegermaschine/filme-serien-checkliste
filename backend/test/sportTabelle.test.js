/* Tests fuer die selbst gerechneten Tabellen (lib/sportDaten.js): Welcher
 * Wettbewerb hat ueberhaupt eine Tabelle, und stimmt die Rechnung? */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hatTabelle, tabelleAusSpielen, LIGEN_MIT_TABELLE, LIGAPHASE_COMPS, GRUPPEN_COMPS } from '../lib/sportDaten.js';

test('hatTabelle: Ligen, Ligaphase und Gruppen ja -- K.-o. nein', () => {
  for (const c of ['bl1', 'bl2', 'bl3', 'ucl', 'uel', 'nla', 'em', 'wm']) {
    assert.equal(hatTabelle(c), true, `${c} sollte eine Tabelle haben`);
  }
  // DFB-Pokal und Supercup sind reines K.-o. -- eine Tabelle waere erfunden.
  assert.equal(hatTabelle('dfb'), false);
  assert.equal(hatTabelle('blsc'), false);
  assert.equal(hatTabelle('gibtsnicht'), false);
});

test('Wettbewerbs-Listen ueberschneiden sich nicht', () => {
  for (const c of LIGAPHASE_COMPS) assert.equal(LIGEN_MIT_TABELLE.has(c), false);
  for (const c of GRUPPEN_COMPS) assert.equal(LIGEN_MIT_TABELLE.has(c), false);
  for (const c of GRUPPEN_COMPS) assert.equal(LIGAPHASE_COMPS.has(c), false);
});

test('tabelleAusSpielen: Punkte, Tore und Reihung stimmen', () => {
  const [gruppe] = tabelleAusSpielen([
    { gruppe: null, heim: 'A', gast: 'B', th: 3, ta: 0 },   // A gewinnt
    { gruppe: null, heim: 'C', gast: 'A', th: 1, ta: 1 },   // remis
    { gruppe: null, heim: 'B', gast: 'C', th: 2, ta: 0 },   // B gewinnt
  ]);
  assert.equal(gruppe.name, null);
  const [erst, zweit, dritt] = gruppe.zeilen;
  assert.deepEqual(
    { name: erst.name, sp: erst.sp, s: erst.s, u: erst.u, n: erst.n, tore: erst.tore, gegen: erst.gegen, pkt: erst.pkt },
    { name: 'A', sp: 2, s: 1, u: 1, n: 0, tore: 4, gegen: 1, pkt: 4 });
  assert.equal(zweit.name, 'B');   // 3 Punkte
  assert.equal(zweit.pkt, 3);
  assert.equal(dritt.name, 'C');   // 1 Punkt
  assert.equal(dritt.pkt, 1);
});

test('tabelleAusSpielen: bei Punktgleichheit entscheidet Tordifferenz, dann Tore', () => {
  const [g] = tabelleAusSpielen([
    { gruppe: null, heim: 'Wenig', gast: 'X', th: 1, ta: 0 },   // +1, 1 Tor
    { gruppe: null, heim: 'Viel', gast: 'Y', th: 5, ta: 0 },    // +5
    { gruppe: null, heim: 'Mittel', gast: 'Z', th: 3, ta: 1 },  // +2
  ]);
  assert.deepEqual(g.zeilen.slice(0, 3).map((z) => z.name), ['Viel', 'Mittel', 'Wenig']);
});

test('tabelleAusSpielen: gleiche Differenz -> mehr Tore vorn', () => {
  const [g] = tabelleAusSpielen([
    { gruppe: null, heim: 'Torreich', gast: 'X', th: 4, ta: 2 },   // +2, 4 Tore
    { gruppe: null, heim: 'Sparsam', gast: 'Y', th: 2, ta: 0 },    // +2, 2 Tore
  ]);
  assert.deepEqual(g.zeilen.slice(0, 2).map((z) => z.name), ['Torreich', 'Sparsam']);
});

test('tabelleAusSpielen: je Gruppe eine eigene Tabelle, alphabetisch', () => {
  const gruppen = tabelleAusSpielen([
    { gruppe: 'Gruppe B', heim: 'B1', gast: 'B2', th: 1, ta: 0 },
    { gruppe: 'Gruppe A', heim: 'A1', gast: 'A2', th: 2, ta: 2 },
  ]);
  assert.deepEqual(gruppen.map((g) => g.name), ['Gruppe A', 'Gruppe B']);
  assert.deepEqual(gruppen[0].zeilen.map((z) => z.pkt), [1, 1]);
  assert.equal(gruppen[1].zeilen[0].name, 'B1');
});

test('tabelleAusSpielen: Spiele ohne Ergebnis zaehlen nicht mit', () => {
  const gruppen = tabelleAusSpielen([
    { gruppe: null, heim: 'A', gast: 'B', th: null, ta: null },
    { gruppe: null, heim: 'A', gast: 'C', th: 1, ta: 0 },
  ]);
  assert.equal(gruppen[0].zeilen.length, 2);            // nur A und C
  assert.equal(gruppen[0].zeilen[0].sp, 1);
});

test('tabelleAusSpielen: ohne gewertete Spiele bleibt die Liste leer', () => {
  assert.deepEqual(tabelleAusSpielen([]), []);
  assert.deepEqual(tabelleAusSpielen([{ gruppe: null, heim: 'A', gast: 'B', th: null, ta: null }]), []);
});

test('tabelleAusSpielen: Logo wird uebernommen, auch wenn es erst spaeter kommt', () => {
  const [g] = tabelleAusSpielen([
    { gruppe: null, heim: 'A', gast: 'B', th: 1, ta: 0, heimLogo: null },
    { gruppe: null, heim: 'B', gast: 'A', th: 0, ta: 1, gastLogo: 'https://beispiel/a.png' },
  ]);
  assert.equal(g.zeilen.find((z) => z.name === 'A').logo, 'https://beispiel/a.png');
});
