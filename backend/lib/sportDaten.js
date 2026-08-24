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

/* Torschuetzenliste einer Liga-Saison -- dieselben drei Ligen wie die
   Tabelle (fuer Pokal/Europapokal liefert OpenLigaDB keine gepflegten
   Listen). Gedeckelt auf die Spitze: mehr liest in der App niemand. */
const torschuetzenCache = new Map();   // 'bl1/2026' -> { at, liste }

export async function torschuetzen(wettbewerb, saison, limit = 15) {
  if (!LIGEN_MIT_TABELLE.has(wettbewerb)) return null;
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
