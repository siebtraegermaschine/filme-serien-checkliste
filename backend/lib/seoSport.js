/*
 * SEO-Spielseiten fuer den Sport-Bereich (PLAN-SPORT.md, Auftrag vom
 * 20. August 2026): eine Landingpage je Spiel unter
 * /de-de/spiel/<heim>-<gast>-<matchId>, dazu die Übersicht /de-de/spiele.
 *
 * Zielsuchen wie "wer zeigt dortmund bayern supercup": Die Antwort (WANN
 * läuft das Spiel, WO wird es uebertragen) steht als erster Block ganz oben
 * -- wie in der App. Danach folgen in FESTER Reihenfolge auf jeder Seite
 * dieselben Bloecke (Struktur-Vorgabe): Übertragungstabelle, Steckbrief,
 * Lagetext, "So siehst du das Spiel", Tabellenstand, Formkurven, weitere
 * Spiele, FAQ. Alles selbst formuliert aus eigenen Daten (Rechte-Matrix,
 * OpenLigaDB) -- nichts von fremden Seiten uebernommen.
 *
 * ZEITSTUFEN OHNE VEROEFFENTLICHUNGS-CRON: Die Seiten werden zur Abrufzeit
 * aus der Datenbank gerendert. Welche Bloecke erscheinen und wie die Saetze
 * lauten, haengt deterministisch vom Abstand zum Anstoß ab (fern -> 3 Tage
 * -> morgen -> heute -> 8 Std -> 1 Std -> live -> Endstand). Ein Crawler
 * bekommt damit bei jedem Besuch den aktuellen Stand -- inklusive frischer
 * Tabellenstaende/Formkurven (TTL-Caches unten) und nach Abpfiff dem
 * Ergebnis samt Vergangenheitsform ("Wer zeigte ...?"). Neue Spiele bekommen
 * ihre Seite automatisch mit dem nächsten Datenlauf (sport-fetch.mjs),
 * beendete bleiben 45 Tage als Ergebnisseite stehen (routes/sport.js).
 */
import { pool } from '../db/pool.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { slugify } from './slug.js';
import { attrEsc, dokument, brotkrumenHtml, brotkrumenJsonLd, SITE } from './seoRender.js';

const OLB = 'https://api.openligadb.de';
const LOCALE = 'de-de';

/* ---- Redaktionelle Inhalte (Vorberichte, Aufstellungen fuer Topspiele):
   sport-inhalte.json in der Repo-Wurzel, geschrieben von der taeglichen
   Cloud-Routine, auf den Server kommt sie mit dem Auto-Deploy. Gelesen mit
   kurzem Cache -- die Datei aendert sich hoechstens einmal pro Deploy. ---- */
const INHALTE_PFAD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sport-inhalte.json');
let inhalteCache = { at: 0, daten: {} };
function spielInhalte(externalId) {
  if (Date.now() - inhalteCache.at > 5 * 60_000) {
    let daten = {};
    try { daten = JSON.parse(fs.readFileSync(INHALTE_PFAD, 'utf8')); } catch { /* Datei fehlt: ok */ }
    inhalteCache = { at: Date.now(), daten };
  }
  const e = inhalteCache.daten[String(externalId)];
  return e && typeof e === 'object' ? e : null;
}

/* ---- Zusatzdaten von OpenLigaDB, prozessintern gecacht. 6 Stunden TTL:
   Tabellenstand und Form ändern sich hoechstens am Spieltag, und die
   Crawler-Last darf nicht 1:1 auf OpenLigaDB durchschlagen. Fehler liefern
   null -- die Seite laesst den Block dann schlicht weg. ---- */
const TTL_MS = 6 * 3_600_000;
const tabellenCache = new Map();   // 'bl1/2026' -> { at, rows }
const formCache = new Map();       // teamId -> { at, spiele }

async function olbJson(pfad) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(OLB + pfad, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Nur die drei Ligen haben eine Tabelle; Pokal & Co. lassen den Block weg.
const LIGEN_MIT_TABELLE = new Set(['bl1', 'bl2', 'bl3']);

async function ligaTabelle(wettbewerb, saison) {
  if (!LIGEN_MIT_TABELLE.has(wettbewerb)) return null;
  const key = `${wettbewerb}/${saison}`;
  const c = tabellenCache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.rows;
  const rows = await olbJson(`/getbltable/${wettbewerb}/${saison}`);
  const sauber = Array.isArray(rows) && rows.length ? rows : null;
  tabellenCache.set(key, { at: Date.now(), rows: sauber });
  return sauber;
}

// Formkurve: letzte beendete Spiele eines Teams. getmatchesbyteamid liefert
// AUCH Community-Spielereien ("blclaude", Testligen) -- deshalb streng auf
// die eigenen Wettbewerbe gefiltert (Kleinschreibung: OpenLigaDB ist da
// nicht konsequent).
const FORM_SHORTCUTS = new Set(['bl1', 'bl2', 'bl3', 'dfb', 'ucl', 'uel', 'nla', 'blsupercup']);

async function teamForm(teamId, teamName) {
  if (!teamId) return null;
  const c = formCache.get(teamId);
  if (c && Date.now() - c.at < TTL_MS) return c.spiele;
  const roh = await olbJson(`/getmatchesbyteamid/${teamId}/16/0`);
  let spiele = null;
  if (Array.isArray(roh)) {
    spiele = roh
      .filter((m) => m && m.matchIsFinished && FORM_SHORTCUTS.has(String(m.leagueShortcut || '').toLowerCase()))
      .sort((a, b) => String(b.matchDateTimeUTC).localeCompare(String(a.matchDateTimeUTC)))
      .slice(0, 5)
      .map((m) => {
        const erg = (m.matchResults || []).find((r) => r.resultTypeID === 2) || (m.matchResults || [])[0] || {};
        const heim = m.team1.teamName === teamName;
        const eigene = heim ? erg.pointsTeam1 : erg.pointsTeam2;
        const andere = heim ? erg.pointsTeam2 : erg.pointsTeam1;
        return {
          gegner: heim ? m.team2.teamName : m.team1.teamName,
          heim,
          tore: eigene != null ? `${erg.pointsTeam1}:${erg.pointsTeam2}` : null,
          ausgang: eigene == null ? null : eigene > andere ? 'S' : eigene < andere ? 'N' : 'U',
          datum: String(m.matchDateTimeUTC || '').slice(0, 10),
        };
      });
    if (!spiele.length) spiele = null;
  }
  formCache.set(teamId, { at: Date.now(), spiele });
  return spiele;
}

/* ---- Zeitstufe zur Abrufzeit: bestimmt Wortlaut und Bloecke. ---- */
export function zeitstufe(anstoss, beendet, jetzt = new Date()) {
  const ko = new Date(anstoss);
  const diffMin = (ko - jetzt) / 60000;
  if (beendet || diffMin < -160) return 'beendet';
  if (diffMin <= 0) return 'live';
  if (diffMin <= 60) return 'gleich';
  if (diffMin <= 8 * 60) return 'bald';
  const tagVon = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);
  if (tagVon(ko) === tagVon(jetzt)) return 'heute';
  if (tagVon(ko) === tagVon(new Date(jetzt.getTime() + 86400000))) return 'morgen';
  if (diffMin <= 3 * 24 * 60) return 'nah';
  return 'fern';
}

const datumLang = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const datumKurz = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' });
const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

export function spielSlugId(m) {
  return `${slugify(m.heim)}-${slugify(m.gast)}-${m.external_id}`;
}

/* ---- Zuhause der Spielseiten (Christian, 20.08.2026): Sobald die eigene
   Sport-Domain aktiv ist (SPORT_DOMAIN, siehe server.js), wohnen die Seiten
   NUR dort -- unter kuerzeren Pfaden (/spiel/..., /spiele) und mit eigener
   Marke; movietaste.de leitet per 301 dorthin um und nimmt sie aus der
   eigenen Sitemap (kein doppelter Inhalt auf zwei Domains). Ohne gesetzte
   Domain gilt der bisherige movietaste-Pfad. Env wird bewusst je Aufruf
   gelesen (testbar, kein Neustart-Zwang bei Konfig-Wechsel im Test). ---- */
export function sportDomainAktiv() {
  return !!(process.env.SPORT_DOMAIN || '').trim();
}
export function sportKontext() {
  const domain = (process.env.SPORT_DOMAIN || '').trim().toLowerCase();
  if (!domain) {
    return { basis: SITE, spielPrefix: `/${LOCALE}/spiel`, uebersichtPfad: `/${LOCALE}/spiele`,
             appUrl: SITE + '/sport', marke: null };
  }
  const basis = 'https://' + domain;
  return { basis, spielPrefix: '/spiel', uebersichtPfad: '/spiele',
           appUrl: basis + '/', marke: process.env.SPORT_BRAND || 'Fußball live im TV' };
}
export function spielPfad(m) {
  return `${sportKontext().spielPrefix}/${spielSlugId(m)}`;
}

// Kopf-/Fusszeile fuer die Sport-Domain-Fassung (movietaste nutzt die
// Standards aus seoRender): eigene Marke, Rechtstexte, OpenLigaDB-Quelle.
function sportKopfFuss(ctx) {
  if (!ctx.marke) return {};
  return {
    basis: ctx.basis,
    // Link-Vorschau mit dem CouchUltras-Logo statt des MovieMatch-Banners
    // (Popcorn); Favicon ebenso (Christian, 20.08.2026).
    bild: ctx.basis + '/couchultras.png',
    favicon: '/cu-favicon-32.png',
    kopfHtml: `<header class="seo-kopf"><a class="marke" href="/"><img class="marke-logo" src="/couchultras.png" alt="${attrEsc(ctx.marke)} – Wissen, wo’s läuft."></a>
      <nav class="seo-nav"><a href="/">Zum Spielplan</a></nav></header>`,
    fussHtml: `<footer>
      <a href="/impressum.html">Impressum</a>
      <a href="/datenschutz.html">Datenschutz</a>
      <a href="https://www.openligadb.de" rel="noopener">Spielplandaten: OpenLigaDB</a>
    </footer>`,
  };
}

/* ---- Daten laden ---- */
export async function ladeSpielSeite(externalId) {
  const id = Number(externalId);
  if (!Number.isFinite(id)) return null;
  const [{ rows: matchRows }, { rows: metaRows }] = await Promise.all([
    pool.query('SELECT * FROM sport_matches WHERE external_id = $1', [id]),
    pool.query('SELECT key, value FROM sport_meta'),
  ]);
  const m = matchRows[0];
  if (!m) return null;
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));

  const [tabelle, formHeim, formGast, weitereRows] = await Promise.all([
    ligaTabelle(m.wettbewerb, m.saison),
    teamForm(m.heim_id, m.heim),
    teamForm(m.gast_id, m.gast),
    pool.query(
      `SELECT external_id, heim, gast, anstoss, runde, wettbewerb FROM sport_matches
        WHERE wettbewerb = $1 AND external_id <> $2 AND anstoss > now()
        ORDER BY anstoss LIMIT 8`, [m.wettbewerb, id]),
  ]);

  return {
    match: m,
    sender: meta.sender || {},
    wettbewerbe: meta.wettbewerbe || {},
    tabelle,
    formHeim,
    formGast,
    weitere: weitereRows.rows,
    inhalte: spielInhalte(m.external_id),
    stufe: zeitstufe(m.anstoss, m.beendet),
  };
}

export async function ladeSpieleUebersicht() {
  const { rows } = await pool.query(
    `SELECT external_id, wettbewerb, runde, anstoss, heim, gast, tv FROM sport_matches
      WHERE anstoss > now() - interval '3 hours' AND anstoss < now() + interval '14 days'
      ORDER BY anstoss`);
  const { rows: metaRows } = await pool.query('SELECT key, value FROM sport_meta');
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
  return { spiele: rows, sender: meta.sender || {}, wettbewerbe: meta.wettbewerbe || {} };
}

/* ---- Bausteine ---- */
function senderVon(daten, slug) {
  return daten.sender[slug] || { name: slug, frei: false };
}
function senderNamen(daten, tv, { mitZusatz = true } = {}) {
  return (tv || []).map((b) => {
    const s = senderVon(daten, b.s);
    const zusatz = [];
    if (b.typ === 'konferenz') zusatz.push('Konferenz');
    if (s.frei) zusatz.push('frei empfangbar');
    if (b.unsicher) zusatz.push('voraussichtlich');
    return s.name + (mitZusatz && zusatz.length ? ` (${zusatz.join(', ')})` : '');
  });
}
function paarung(m) { return `${m.heim} – ${m.gast}`; }
function wettbewerbName(daten, kuerzel) {
  return (daten.wettbewerbe[kuerzel] || {}).name || kuerzel;
}

// Der eine Satz, um den es geht -- ganz oben, je Zeitstufe formuliert.
function antwortSatz(daten) {
  const m = daten.match;
  const sender = senderNamen(daten, m.tv);
  const wo = sender.length
    ? `live bei ${sender.join(' und ')}`
    : 'der übertragende Sender steht noch nicht fest';
  const wann = `am ${datumLang.format(m.anstoss)} um ${uhrzeit.format(m.anstoss)} Uhr`;
  // Komma statt Klammer: die Runde steht selbst schon mal in Klammern
  // ("Supercup (Finale)" ergaebe sonst eine Doppelklammer im Antwortsatz).
  const comp = `${wettbewerbName(daten, m.wettbewerb)}${m.runde ? `, ${m.runde}` : ''}`;
  switch (daten.stufe) {
    case 'beendet': {
      const erg = m.tore_heim != null ? ` und endete ${m.tore_heim}:${m.tore_gast}` : '';
      return `${paarung(m)} (${comp}) lief ${wann} ${sender.length ? `live bei ${sender.join(' und ')}` : ''}${erg}.`;
    }
    case 'live':
      return `${paarung(m)} (${comp}) läuft JETZT ${sender.length ? `live bei ${sender.join(' und ')}` : ''} – Anstoß war um ${uhrzeit.format(m.anstoss)} Uhr.`;
    case 'gleich':
      return `${paarung(m)} (${comp}) beginnt in weniger als einer Stunde: Anstoß heute um ${uhrzeit.format(m.anstoss)} Uhr, ${wo}.`;
    case 'bald':
    case 'heute':
      return `${paarung(m)} (${comp}) läuft HEUTE um ${uhrzeit.format(m.anstoss)} Uhr ${wo}.`;
    case 'morgen':
      return `${paarung(m)} (${comp}) läuft MORGEN um ${uhrzeit.format(m.anstoss)} Uhr ${wo}.`;
    default:
      return `${paarung(m)} (${comp}) läuft ${wann} ${wo}.`;
  }
}

// Laengerer Lagetext unter dem Steckbrief -- aendert sich mit der Zeitstufe,
// damit die Seite bei jedem Crawl aktuell formuliert ist.
function lageText(daten) {
  const m = daten.match;
  const frei = (m.tv || []).some((b) => senderVon(daten, b.s).frei);
  const freiSatz = frei
    ? 'Mindestens ein Sender zeigt die Partie frei empfangbar – ein Abo ist dafuer nicht nötig.'
    : (m.tv || []).length
      ? 'Alle übertragenden Sender sind Abo-Angebote; frei empfangbar ist die Partie nach aktuellem Stand nicht.'
      : '';
  switch (daten.stufe) {
    case 'beendet':
      return `Die Partie ist beendet${m.tore_heim != null ? `, der Endstand lautet ${m.tore_heim}:${m.tore_gast}` : ''}. Diese Seite bleibt als Nachschlagewerk stehen: Wer die Übertragung verpasst hat, findet Zusammenfassungen üblicherweise beim jeweiligen Sender.`;
    case 'live':
      return `Das Spiel läuft gerade. Wer jetzt einschaltet, findet die Übertragung bei den oben genannten Sendern – die Links fuehren direkt dorthin. ${freiSatz}`;
    case 'gleich':
      return `Es geht gleich los: Der Anstoß ist in weniger als einer Stunde. Jetzt ist der richtige Moment, den Stream zu starten oder den Kanal einzuschalten. ${freiSatz}`;
    case 'bald':
      return `Heute ist Spieltag – in wenigen Stunden rollt der Ball. Die Sender-Zuordnung oben ist final; kurzfristige Änderungen sind am Spieltag selbst nicht mehr üblich. ${freiSatz}`;
    case 'heute':
      return `Heute ist Spieltag. Alle Angaben zur Übertragung oben sind auf dem Stand von heute. ${freiSatz}`;
    case 'morgen':
      return `Morgen ist es so weit. Die Sender-Zuordnung steht; sollten sich kurzfristig Details ändern (etwa der genaue Kanal), wird diese Seite automatisch aktualisiert. ${freiSatz}`;
    case 'nah':
      return `Das Spiel steht kurz bevor (weniger als drei Tage). Anstoßzeit und Sender oben sind der aktuelle Stand und werden bis zum Spieltag laufend gegengeprüft. ${freiSatz}`;
    default:
      return `Bis zum Anstoß ist es noch etwas hin. Termin und Sender oben entsprechen dem heutigen Stand – Verlegungen und Rechte-Details fliessen automatisch ein, sobald sie bekannt sind. Ein Blick kurz vor dem Spieltag lohnt sich. ${freiSatz}`;
  }
}

function uebertragungsTabelle(daten) {
  const m = daten.match;
  if (!(m.tv || []).length) {
    return `<p class="hinweis">Der übertragende Sender steht fuer diese Partie noch nicht fest. Sobald die Zuordnung bekannt ist, erscheint sie hier.</p>`;
  }
  const zeilen = m.tv.map((b) => {
    const s = senderVon(daten, b.s);
    const ziele = Array.isArray(s.links) && s.links.length ? s.links : (s.link ? [{ n: s.name, url: s.link }] : []);
    const linkHtml = ziele.map((z) => `<a href="${attrEsc(z.url)}" rel="nofollow noopener">${attrEsc(z.n)}</a>`).join(' · ');
    const empfang = s.frei ? 'frei empfangbar' : 'Abo';
    const kanal = b.kanal || s.kanal || '–';
    const zusatz = [b.typ === 'konferenz' ? 'Konferenz' : '', b.unsicher ? 'voraussichtlich' : ''].filter(Boolean).join(', ');
    return `<tr><td>${attrEsc(s.name)}${zusatz ? ` <span class="hinweis">(${attrEsc(zusatz)})</span>` : ''}</td>` +
           `<td>${attrEsc(kanal)}</td><td>${empfang}</td><td>${linkHtml || '–'}</td></tr>`;
  }).join('');
  return `<table class="fakten uebertragung"><thead><tr><th>Sender</th><th>Kanal</th><th>Empfang</th><th>Direkt dorthin</th></tr></thead><tbody>${zeilen}</tbody></table>`;
}

function steckbrief(daten) {
  const m = daten.match;
  const zeilen = [
    ['Begegnung', paarung(m)],
    ['Wettbewerb', wettbewerbName(daten, m.wettbewerb)],
    m.runde ? ['Runde / Spieltag', m.runde] : null,
    ['Datum', datumLang.format(m.anstoss)],
    ['Anstoß', `${uhrzeit.format(m.anstoss)} Uhr`],
    ['Übertragung', senderNamen(daten, m.tv).join(', ') || 'noch offen'],
    (daten.stufe === 'beendet' && m.tore_heim != null) ? ['Endstand', `${m.tore_heim}:${m.tore_gast}`] : null,
    (daten.stufe === 'live' && m.tore_heim != null) ? ['Zwischenstand', `${m.tore_heim}:${m.tore_gast}`] : null,
  ].filter(Boolean);
  return `<table class="fakten">${zeilen.map(([k, v]) => `<tr><th>${attrEsc(k)}</th><td>${attrEsc(v)}</td></tr>`).join('')}</table>`;
}

function soSehen(daten) {
  const m = daten.match;
  if (!(m.tv || []).length) return '';
  const saetze = [];
  for (const b of m.tv) {
    const s = senderVon(daten, b.s);
    if (s.frei) {
      saetze.push(`Frei empfangbar läuft die Partie bei ${s.name}${b.kanal || s.kanal ? ` (${b.kanal || s.kanal})` : ''}${s.info ? ` – ${s.info}` : '.'}`);
    } else {
      saetze.push(`Mit Abo siehst du das Spiel bei ${s.name}${b.kanal || s.kanal ? ` auf ${b.kanal || s.kanal}` : ''}${b.typ === 'konferenz' ? ' (als Teil der Konferenz)' : ''}${s.info ? ` – ${s.info}` : '.'}`);
    }
  }
  const ctx = sportKontext();
  saetze.push(ctx.marke
    ? `Den kompletten Spielplan mit Sender-Angaben – filterbar nach Wettbewerb, Free-TV und deinem Verein – gibt es auf der <a href="${ctx.appUrl}">Startseite</a>.`
    : `Den kompletten Spielplan mit Sender-Angaben – filterbar nach Wettbewerb, Free-TV und deinem Verein – gibt es in der <a href="${ctx.appUrl}">Sport-Übersicht von MovieMatch</a>.`);
  return `<h2>So siehst du das Spiel</h2>${saetze.map((t) => `<p>${t}</p>`).join('')}`;
}

function tabellenBlock(daten) {
  if (!daten.tabelle) return '';
  const m = daten.match;
  const zeilen = daten.tabelle.map((t, i) => {
    const dabei = t.teamName === m.heim || t.teamName === m.gast;
    return `<tr${dabei ? ' class="hervor"' : ''}><td>${i + 1}</td><td>${attrEsc(t.teamName)}</td>` +
           `<td>${t.matches}</td><td>${t.won}-${t.draw}-${t.lost}</td><td>${t.goals}:${t.opponentGoals}</td><td>${t.points}</td></tr>`;
  }).join('');
  return `<h2>Tabellenstand ${attrEsc(wettbewerbName(daten, m.wettbewerb))}</h2>
  <table class="fakten uebertragung"><thead><tr><th>Platz</th><th>Team</th><th>Spiele</th><th>S-U-N</th><th>Tore</th><th>Punkte</th></tr></thead><tbody>${zeilen}</tbody></table>`;
}

function formBlock(daten) {
  const teile = [];
  for (const [name, form] of [[daten.match.heim, daten.formHeim], [daten.match.gast, daten.formGast]]) {
    if (!form) continue;
    const eintraege = form.map((f) =>
      `<li><b>${f.ausgang || '?'}</b> ${f.tore ? attrEsc(f.tore) + ' ' : ''}${f.heim ? 'gegen' : 'bei'} ${attrEsc(f.gegner)} <span class="hinweis">(${attrEsc(f.datum)})</span></li>`).join('');
    teile.push(`<h3>${attrEsc(name)} – letzte Spiele</h3><ul class="form-liste">${eintraege}</ul>`);
  }
  if (!teile.length) return '';
  return `<h2>Formkurve</h2><p class="hinweis">S = Sieg, U = Unentschieden, N = Niederlage – jeweils aus Sicht des genannten Teams, Pflichtspiele der erfassten Wettbewerbe.</p>${teile.join('')}`;
}

// Redaktioneller Vorbericht (taegliche Routine) -- nur vor dem Spiel; nach
// dem Abpfiff waere ein "Blick voraus" unfreiwillig komisch.
function vorberichtBlock(daten) {
  const i = daten.inhalte;
  if (!i || !i.vorbericht || daten.stufe === 'beendet') return '';
  const absaetze = String(i.vorbericht).split('\n\n').map((a) => a.trim()).filter(Boolean);
  return `<h2>Vorbericht</h2>${absaetze.map((a) => `<p>${attrEsc(a)}</p>`).join('')}`;
}

// Voraussichtliche Aufstellungen -- nur Topspiele (Entscheidung 20.08.2026),
// nur solange das Spiel nicht laeuft/vorbei ist, und ausdruecklich als
// Prognose gekennzeichnet (offizielle Aufstellungen gibt es erst ~1 Stunde
// vor Anstoss und nur beim Veranstalter).
function aufstellungBlock(daten) {
  const i = daten.inhalte;
  if (!i || !i.aufstellung || daten.stufe === 'beendet' || daten.stufe === 'live') return '';
  const absaetze = String(i.aufstellung).split('\n\n').map((a) => a.trim()).filter(Boolean);
  return `<h2>Voraussichtliche Aufstellungen</h2>
  <p class="hinweis">Prognose auf Basis oeffentlich verfuegbarer Informationen${i.stand ? ` (Stand: ${attrEsc(i.stand)})` : ''} – die offiziellen Aufstellungen veroeffentlichen die Vereine erst rund eine Stunde vor Anstoss.</p>
  ${absaetze.map((a) => `<p>${attrEsc(a)}</p>`).join('')}`;
}

function weitereBlock(daten) {
  if (!daten.weitere.length) return '';
  const li = daten.weitere.map((w) =>
    `<li><a href="${spielPfad(w)}">${attrEsc(w.heim)} – ${attrEsc(w.gast)}</a> <span class="hinweis">(${datumKurz.format(w.anstoss)}, ${uhrzeit.format(w.anstoss)} Uhr)</span></li>`).join('');
  return `<h2>Weitere Spiele: ${attrEsc(wettbewerbName(daten, daten.match.wettbewerb))}</h2><ul>${li}</ul>
  <p><a href="${sportKontext().uebersichtPfad}">Alle Spiele der nächsten zwei Wochen im Überblick</a></p>`;
}

function faq(daten) {
  const m = daten.match;
  const vorbei = daten.stufe === 'beendet';
  const sender = senderNamen(daten, m.tv);
  const freie = (m.tv || []).filter((b) => senderVon(daten, b.s).frei).map((b) => senderVon(daten, b.s).name);
  const streams = (m.tv || []).map((b) => {
    const s = senderVon(daten, b.s);
    return s.kanal || s.name;
  });
  const fragen = [
    [`Wer ${vorbei ? 'zeigte' : 'zeigt'} ${paarung(m)}?`,
     sender.length ? `${vorbei ? 'Die Partie lief' : 'Die Partie läuft'} bei ${sender.join(' und ')}.` : 'Die Sender-Zuordnung steht noch nicht fest.'],
    [`Wann ${vorbei ? 'war' : 'ist'} Anstoß?`,
     `Anstoß ${vorbei ? 'war' : 'ist'} am ${datumLang.format(m.anstoss)} um ${uhrzeit.format(m.anstoss)} Uhr (deutscher Zeit).`],
    [`${vorbei ? 'Lief' : 'Läuft'} ${paarung(m)} im Free-TV?`,
     freie.length ? `Ja – frei empfangbar bei ${freie.join(' und ')}.` : `Nein, nach aktuellem Stand ${vorbei ? 'lief' : 'läuft'} die Partie nur bei Abo-Anbietern.`],
    [`Wo ${vorbei ? 'gab es' : 'gibt es'} das Spiel im Livestream?`,
     streams.length ? `Im Stream ${vorbei ? 'lief' : 'läuft'} das Spiel über: ${[...new Set(streams)].join(', ')}.` : 'Noch offen.'],
    [`Zu welchem Wettbewerb gehört die Partie?`,
     `${paarung(m)} ${vorbei ? 'war' : 'ist'} ein Spiel im Wettbewerb ${wettbewerbName(daten, m.wettbewerb)}${m.runde ? `, ${m.runde}` : ''}.`],
  ];
  if (vorbei && m.tore_heim != null) {
    fragen.push([`Wie ist ${paarung(m)} ausgegangen?`, `Das Spiel endete ${m.tore_heim}:${m.tore_gast}.`]);
  }
  const html = `<h2>Häufige Fragen</h2>` + fragen.map(([f, a]) =>
    `<h3>${attrEsc(f)}</h3><p>${attrEsc(a)}</p>`).join('');
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: fragen.map(([f, a]) => ({
      '@type': 'Question', name: f, acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
  return { html, jsonLd };
}

/* ---- Die Spielseite ---- */
export function seiteSpiel(daten) {
  const m = daten.match;
  const pfad = spielPfad(m);
  const comp = wettbewerbName(daten, m.wettbewerb);
  const sender = senderNamen(daten, m.tv, { mitZusatz: false });
  const vorbei = daten.stufe === 'beendet';
  const markeSuffix = sportKontext().marke ? ` | ${sportKontext().marke}` : ' | MovieMatch';
  const titelZeile = vorbei
    ? `${paarung(m)}${m.tore_heim != null ? ` ${m.tore_heim}:${m.tore_gast}` : ''}: So lief die Übertragung${markeSuffix}`
    : `Wer zeigt ${paarung(m)}? Übertragung am ${datumKurz.format(m.anstoss)}${markeSuffix}`;
  const beschreibung = antwortSatz(daten).slice(0, 200);
  const ctx = sportKontext();
  const kette = ctx.marke
    ? [ { label: ctx.marke, href: '/' }, { label: 'Spiele', href: ctx.uebersichtPfad }, { label: paarung(m) } ]
    : [ { label: 'Start', href: SITE + '/' }, { label: 'Sport', href: SITE + '/sport' },
        { label: 'Spiele', href: ctx.uebersichtPfad }, { label: paarung(m) } ];
  const faqTeil = faq(daten);
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'SportsEvent',
      name: `${paarung(m)} (${comp})`,
      startDate: new Date(m.anstoss).toISOString(),
      eventStatus: 'https://schema.org/EventScheduled',
      homeTeam: { '@type': 'SportsTeam', name: m.heim },
      awayTeam: { '@type': 'SportsTeam', name: m.gast },
      competitor: [
        { '@type': 'SportsTeam', name: m.heim },
        { '@type': 'SportsTeam', name: m.gast },
      ],
      // Vor-Ort-Angaben kennen wir nicht -- fuer Google reicht der Modus.
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: ctx.basis + pfad },
      ...(sender.length ? {
        publication: (m.tv || []).map((b) => ({
          '@type': 'BroadcastEvent',
          isLiveBroadcast: true,
          startDate: new Date(m.anstoss).toISOString(),
          videoFormat: 'HD',
          broadcastOfEvent: { '@type': 'SportsEvent', name: `${paarung(m)} (${comp})` },
          broadcastService: { '@type': 'BroadcastService', name: senderVon(daten, b.s).name },
        })),
      } : {}),
    },
    faqTeil.jsonLd,
    brotkrumenJsonLd(kette),
  ];

  // Sichtbare Frische: Zeitpunkt des letzten Datenlaufs (aktualisiert sich
  // mehrmals taeglich mit dem Ingest).
  const stand = m.fetched_at
    ? `<p class="hinweis">Stand: ${datumKurz.format(m.fetched_at)}, ${uhrzeit.format(m.fetched_at)} Uhr – Angaben ohne Gewähr.</p>`
    : '';

  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>${vorbei ? `${attrEsc(paarung(m))}: Übertragung im Rückblick` : `Wer zeigt ${attrEsc(paarung(m))}?`}</h1>
    <p class="spiel-antwort">${attrEsc(antwortSatz(daten))}</p>
    <h2>Übertragung im Überblick</h2>
    ${uebertragungsTabelle(daten)}
    <h2>Das Spiel im Steckbrief</h2>
    ${steckbrief(daten)}
    <p class="einleitung">${lageText(daten)}</p>
    ${soSehen(daten)}
    ${vorberichtBlock(daten)}
    ${tabellenBlock(daten)}
    ${formBlock(daten)}
    ${aufstellungBlock(daten)}
    ${weitereBlock(daten)}
    ${faqTeil.html}
    ${stand}
  `;
  // Indexierbar nach der Haus-Regel "eigener Inhalt vorhanden": Antwortbox,
  // Steckbrief, Lagetext und FAQ sind seitenspezifisch aus der eigenen
  // Rechte-Matrix und den Spieldaten formuliert -- kein leeres Geruest.
  // (Deshalb hier true, sobald es das Spiel wirklich gibt.)
  return dokument({
    locale: LOCALE, pfad, titelZeile, beschreibung,
    indexierbar: true, jsonLd, bodyHtml, ...sportKopfFuss(ctx),
  });
}

/* ---- Die Übersicht (/de-de/spiele bzw. /spiele auf der Sport-Domain) ---- */
export function seiteSpiele(daten) {
  const ctx = sportKontext();
  const pfad = ctx.uebersichtPfad;
  const titelZeile = `Fußball heute & diese Woche: Alle Spiele mit Sender${ctx.marke ? ` | ${ctx.marke}` : ' | MovieMatch'}`;
  const beschreibung = 'Welches Fußballspiel läuft wann und wo? Alle Partien der nächsten zwei Wochen mit Anstoß, Sender und Free-TV-Hinweis.';
  const kette = ctx.marke
    ? [ { label: ctx.marke, href: '/' }, { label: 'Spiele' } ]
    : [ { label: 'Start', href: SITE + '/' }, { label: 'Sport', href: SITE + '/sport' }, { label: 'Spiele' } ];
  // Nach Berliner Kalendertag gruppieren.
  const tagVon = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' });
  const tagKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });
  const gruppen = new Map();
  for (const s of daten.spiele) {
    const key = tagKey.format(s.anstoss);
    if (!gruppen.has(key)) gruppen.set(key, { label: tagVon.format(s.anstoss), spiele: [] });
    gruppen.get(key).spiele.push(s);
  }
  const bloecke = [...gruppen.values()].map((g) => {
    const li = g.spiele.map((s) => {
      const frei = (s.tv || []).some((b) => (daten.sender[b.s] || {}).frei);
      const senderText = (s.tv || []).map((b) => (daten.sender[b.s] || { name: b.s }).name).join(', ');
      return `<li><a href="${spielPfad(s)}">${attrEsc(s.heim)} – ${attrEsc(s.gast)}</a> ` +
             `<span class="hinweis">${uhrzeit.format(s.anstoss)} Uhr · ${attrEsc(wettbewerbName(daten, s.wettbewerb))}` +
             `${senderText ? ` · ${attrEsc(senderText)}` : ''}${frei ? ' · Free-TV' : ''}</span></li>`;
    }).join('');
    return `<h2>${attrEsc(g.label)}</h2><ul>${li}</ul>`;
  }).join('');
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.spiele.slice(0, 50).map((s, i) => ({
      '@type': 'ListItem', position: i + 1, name: `${s.heim} – ${s.gast}`,
      url: ctx.basis + spielPfad(s),
    })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Fußball heute &amp; diese Woche: Alle Spiele mit Sender</h1>
    <p class="einleitung">Jede Partie mit Anstoßzeit und Übertragung – ein Klick führt zur Detailseite mit Sendern, Kanälen, Tabellenstand und Formkurve. Den filterbaren Spielplan gibt es ${ctx.marke ? `auf der <a href="${ctx.appUrl}">Startseite</a>` : `in der <a href="${ctx.appUrl}">Sport-Übersicht von MovieMatch</a>`}.</p>
    ${bloecke || '<p class="hinweis">Aktuell sind keine Spiele im Zeitraum.</p>'}
  `;
  return dokument({
    locale: LOCALE, pfad, titelZeile, beschreibung,
    indexierbar: daten.spiele.length > 0, jsonLd, bodyHtml, ...sportKopfFuss(ctx),
  });
}

/* ---- Sitemap der Spielseiten in der Sport-Domain-Fassung (fuer
   /sitemap-spiele.xml dort; movietaste liefert im aktiven Zustand keine
   Spiel-URLs mehr, siehe seoSitemap.js). ---- */
export async function sitemapSpiele() {
  const ctx = sportKontext();
  const { rows } = await pool.query(
    `SELECT external_id, heim, gast, anstoss, fetched_at FROM sport_matches ORDER BY anstoss`);
  const heute = new Date().toISOString().slice(0, 10);
  const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const urls = [{ loc: `${ctx.basis}${ctx.uebersichtPfad}`, lastmod: heute }].concat(rows.map((m) => ({
    loc: ctx.basis + spielPfad(m),
    lastmod: Math.abs(new Date(m.anstoss) - Date.now()) < 3 * 86400000
      ? heute : (m.fetched_at ? m.fetched_at.toISOString().slice(0, 10) : null),
  })));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    `\n</urlset>`;
}
