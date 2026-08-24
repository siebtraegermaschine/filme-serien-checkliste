/*
 * Zusatzdaten von OpenLigaDB fuer App UND SEO-Seiten (24.08.2026): Tabelle,
 * Torschuetzenliste, Formkurve und Direktvergleich. Bis heute lebten Tabelle
 * und Form nur in lib/seoSport.js -- mit den neuen App-Ansichten (Tabelle,
 * Spielkarten-Details) brauchen beide Seiten dieselben Abrufe, deshalb
 * wohnen sie jetzt hier.
 *
 * Alles prozessintern gecacht (6 Stunden TTL): Die Werte aendern sich
 * hoechstens am Spieltag, und weder Crawler- noch App-Last darf 1:1 auf die
 * kostenlose Community-API durchschlagen. Fehler liefern null -- die
 * Aufrufer lassen den jeweiligen Block dann schlicht weg.
 */

const OLB = 'https://api.openligadb.de';
const TTL_MS = 6 * 3_600_000;

export async function olbJson(pfad) {
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
export const LIGEN_MIT_TABELLE = new Set(['bl1', 'bl2', 'bl3']);

const tabellenCache = new Map();   // 'bl1/2026' -> { at, rows }

export async function ligaTabelle(wettbewerb, saison) {
  if (!LIGEN_MIT_TABELLE.has(wettbewerb)) return null;
  const key = `${wettbewerb}/${saison}`;
  const c = tabellenCache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.rows;
  const rows = await olbJson(`/getbltable/${wettbewerb}/${saison}`);
  const sauber = Array.isArray(rows) && rows.length ? rows : null;
  tabellenCache.set(key, { at: Date.now(), rows: sauber });
  return sauber;
}

/* ---- Tabellen jenseits der drei Ligen (Christian, 24.08.2026) ----
   Die Frage war, ob eine Tabelle auch fuer Pokal und Europapokal geht. Die
   ehrliche Antwort steckt in diesen drei Listen:

   - LIGEN_MIT_TABELLE: eigene Liga-Tabelle bei OpenLigaDB (getbltable) --
     amtlich gefuehrt, inklusive der jeweiligen Sonderregeln. Die nehmen wir.
   - LIGAPHASE: Champions und Europa League. Seit 2024/25 spielen dort ALLE
     in einer Ligaphase, eine Tabelle ergibt also Sinn. getbltable liefert
     sie zwar auch, wirft aber die K.-o.-Spiele mit hinein (Arsenal stand da
     nach 15 statt 8 Partien) -- deshalb rechnen wir sie selbst, nur aus den
     Spieltagen der Ligaphase.
   - GRUPPEN: Nations League, EM, WM. Dort gibt es Gruppen, und getbltable
     wirft sie in EINE Liste (16 Mannschaften ohne Gruppenbezug, wertlos).
     Also je Gruppe eine eigene Tabelle, gerechnet aus den Spielen.

   Nicht dabei und bewusst ohne Tabelle: DFB-Pokal und Supercup. Reines
   K.-o. -- eine "Tabelle" waere dort erfunden (die API listet brav alle 64
   Teilnehmer mit "1 Spiel, 3 Punkte", was niemandem etwas sagt). ---- */
export const LIGAPHASE_COMPS = new Set(['ucl', 'uel']);
export const GRUPPEN_COMPS = new Set(['nla', 'em', 'wm']);
export function hatTabelle(wettbewerb) {
  return LIGEN_MIT_TABELLE.has(wettbewerb) || LIGAPHASE_COMPS.has(wettbewerb) || GRUPPEN_COMPS.has(wettbewerb);
}

/* Aus Spielen eine Tabelle je Gruppe rechnen. Reine Funktion -- die
   Punktregel (3/1/0) und die Reihung nach Punkten, Tordifferenz, Toren sind
   der ueberall gebraeuchliche Nenner. Feinheiten wie der direkte Vergleich
   (EM/WM) bleiben aussen vor; die Seite sagt das dazu, statt Genauigkeit
   vorzutaeuschen. Nur BEENDETE Spiele zaehlen. */
export function tabelleAusSpielen(spiele) {
  const gruppen = new Map();
  for (const s of spiele) {
    if (!s || s.th == null || s.ta == null) continue;
    const key = s.gruppe || '';
    if (!gruppen.has(key)) gruppen.set(key, new Map());
    const tabelle = gruppen.get(key);
    const hole = (name, logo) => {
      if (!tabelle.has(name)) {
        tabelle.set(name, { name, logo: logo || null, sp: 0, s: 0, u: 0, n: 0, tore: 0, gegen: 0, pkt: 0 });
      }
      const z = tabelle.get(name);
      if (!z.logo && logo) z.logo = logo;
      return z;
    };
    const h = hole(s.heim, s.heimLogo);
    const g = hole(s.gast, s.gastLogo);
    h.sp++; g.sp++;
    h.tore += s.th; h.gegen += s.ta;
    g.tore += s.ta; g.gegen += s.th;
    if (s.th > s.ta) { h.s++; g.n++; h.pkt += 3; }
    else if (s.th < s.ta) { g.s++; h.n++; g.pkt += 3; }
    else { h.u++; g.u++; h.pkt++; g.pkt++; }
  }
  return [...gruppen.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'de'))
    .map(([name, tabelle]) => ({
      name: name || null,
      zeilen: [...tabelle.values()].sort((a, b) =>
        b.pkt - a.pkt ||
        (b.tore - b.gegen) - (a.tore - a.gegen) ||
        b.tore - a.tore ||
        a.name.localeCompare(b.name, 'de')),
    }));
}

/* Welche Runden zaehlen fuer die Tabelle eines Wettbewerbs? Ligaphase: die
   nummerierten Spieltage (K.-o.-Runden heissen "Achtelfinale" & Co.).
   Gruppen: alles, was "Gruppe ..." heisst. */
function rundeZaehlt(wettbewerb, runde) {
  const r = String(runde || '');
  if (LIGAPHASE_COMPS.has(wettbewerb)) return /^\s*\d+\.\s*Spieltag\s*$/.test(r);
  if (GRUPPEN_COMPS.has(wettbewerb)) return /^\s*Gruppe\b/i.test(r);
  return false;
}

const berechnetCache = new Map();   // 'ucl/2026' -> { at, gruppen }

/* Tabelle(n) eines Wettbewerbs. Rueckgabe immer eine Liste von Gruppen
   ([{ name, zeilen }]) -- bei Ligen und Ligaphase genau eine mit name null.
   null heisst "fuer diesen Wettbewerb gibt es keine Tabelle". */
export async function wettbewerbTabellen(wettbewerb, saison) {
  if (LIGEN_MIT_TABELLE.has(wettbewerb)) {
    const rows = await ligaTabelle(wettbewerb, saison);
    if (!rows) return [];
    return [{
      name: null,
      zeilen: rows.map((t) => ({
        name: t.teamName, logo: t.teamIconUrl || null,
        sp: t.matches, s: t.won, u: t.draw, n: t.lost,
        tore: t.goals, gegen: t.opponentGoals, pkt: t.points,
      })),
    }];
  }
  if (!hatTabelle(wettbewerb)) return null;

  const key = `${wettbewerb}/${saison}`;
  const c = berechnetCache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.gruppen;
  const roh = await olbJson(`/getmatchdata/${wettbewerb}/${saison}`);
  let gruppen = [];
  if (Array.isArray(roh)) {
    const spiele = roh
      .filter((m) => m && m.matchIsFinished && m.team1 && m.team2
        && rundeZaehlt(wettbewerb, m.group && m.group.groupName))
      .map((m) => {
        const erg = (m.matchResults || []).find((r) => r.resultTypeID === 2) || (m.matchResults || [])[0] || {};
        return {
          gruppe: GRUPPEN_COMPS.has(wettbewerb) ? (m.group && m.group.groupName) || null : null,
          heim: m.team1.teamName, gast: m.team2.teamName,
          heimLogo: m.team1.teamIconUrl, gastLogo: m.team2.teamIconUrl,
          th: erg.pointsTeam1, ta: erg.pointsTeam2,
        };
      });
    gruppen = tabelleAusSpielen(spiele);
  }
  berechnetCache.set(key, { at: Date.now(), gruppen });
  return gruppen;
}

/* Torschuetzenliste einer Saison. OpenLigaDB pflegt sie nicht ueberall (fuer
   Europa League und Laenderspiele kommt eine leere Liste) -- dann faellt der
   Block weg. Gedeckelt auf die Spitze: mehr liest in der App niemand. */
const torschuetzenCache = new Map();   // 'bl1/2026' -> { at, liste }

export async function torschuetzen(wettbewerb, saison, limit = 15) {
  if (!hatTabelle(wettbewerb)) return null;
  const key = `${wettbewerb}/${saison}`;
  const c = torschuetzenCache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.liste ? c.liste.slice(0, limit) : null;
  const roh = await olbJson(`/getgoalgetters/${wettbewerb}/${saison}`);
  let liste = null;
  if (Array.isArray(roh) && roh.length) {
    liste = roh
      .filter((g) => g && g.goalGetterName && g.goalCount > 0)
      .sort((a, b) => b.goalCount - a.goalCount)
      .slice(0, 30)
      .map((g) => ({ name: String(g.goalGetterName).trim(), tore: g.goalCount }));
    if (!liste.length) liste = null;
  }
  torschuetzenCache.set(key, { at: Date.now(), liste });
  return liste ? liste.slice(0, limit) : null;
}

// Formkurve: letzte beendete Spiele eines Teams. getmatchesbyteamid liefert
// AUCH Community-Spielereien ("blclaude", Testligen) -- deshalb streng auf
// die eigenen Wettbewerbe gefiltert (Kleinschreibung: OpenLigaDB ist da
// nicht konsequent).
export const FORM_SHORTCUTS = new Set(['bl1', 'bl2', 'bl3', 'dfb', 'ucl', 'uel', 'nla', 'blsupercup']);

const formCache = new Map();       // teamId -> { at, spiele }

export async function teamForm(teamId, teamName) {
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

/* Direktvergleich zweier Teams: OpenLigaDB liefert unter
   /getmatchdata/<teamId1>/<teamId2> ALLE gemeinsamen Spiele (auch kuenftige
   und Fremdligen) -- hier bleiben nur beendete Pflichtspiele der eigenen
   Wettbewerbe, juengste zuerst. Als eigene reine Funktion testbar. */
export function duelleAusOlb(roh, limit = 8) {
  if (!Array.isArray(roh)) return null;
  const duelle = roh
    .filter((m) => m && m.matchIsFinished && m.team1 && m.team2
      && FORM_SHORTCUTS.has(String(m.leagueShortcut || '').toLowerCase()))
    .sort((a, b) => String(b.matchDateTimeUTC).localeCompare(String(a.matchDateTimeUTC)))
    .slice(0, limit)
    .map((m) => {
      const erg = (m.matchResults || []).find((r) => r.resultTypeID === 2) || (m.matchResults || [])[0] || {};
      if (erg.pointsTeam1 == null) return null;
      return {
        datum: String(m.matchDateTimeUTC || '').slice(0, 10),
        heim: m.team1.teamName,
        gast: m.team2.teamName,
        th: erg.pointsTeam1,
        ta: erg.pointsTeam2,
        comp: String(m.leagueShortcut || '').toLowerCase(),
      };
    })
    .filter(Boolean);
  return duelle.length ? duelle : null;
}

const duellCache = new Map();      // 'kleinereId/groessereId' -> { at, duelle }

export async function direktvergleich(teamId1, teamId2) {
  if (!teamId1 || !teamId2) return null;
  const key = [teamId1, teamId2].sort((a, b) => a - b).join('/');
  const c = duellCache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.duelle;
  const duelle = duelleAusOlb(await olbJson(`/getmatchdata/${teamId1}/${teamId2}`));
  duellCache.set(key, { at: Date.now(), duelle });
  return duelle;
}
