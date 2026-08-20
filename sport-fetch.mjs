#!/usr/bin/env node
/*
 * sport-fetch.mjs – Spielplaene + Sender fuer den "Sport"-Bereich der App
 * (Fussball Deutschland, siehe PLAN-SPORT.md).
 *
 * Holt die Spielplaene von OpenLigaDB (https://api.openligadb.de – freies
 * Community-Projekt, JSON, kein Schluessel) fuer die Wettbewerbe aus
 * sport-rechte.json (bl1, bl2, dfb, ucl, uel) und ordnet jedem Spiel die
 * Sender ueber die Rechte-Matrix zu (backend/lib/sportRechte.js):
 * Wochentag + Anstosszeit (Europe/Berlin) bestimmen den Sender regelbasiert,
 * Pick-Faelle (Amazons CL-Dienstagsspiel, Free-TV-Spiele in Pokal/EL) kommen
 * als Ausnahmen je matchID aus derselben Datei.
 *
 * Geholt werden die AKTUELLE Saison und die davor (Saisonwechsel im Sommer:
 * solange die neue noch leer/unvollstaendig ist, liefert die alte wenigstens
 * die restlichen Termine; Vergangenes filtert das Backend ohnehin weg).
 * Gesendet wird nur ab 3 Tage rueckwirkend -- Historie braucht die App nicht.
 *
 * Laeuft NUR in der GitHub Action (oder lokal). Schickt das Ergebnis per POST
 * an /api/sport/ingest (Auth ueber SPORT_INGEST_SECRET), analog zu
 * cinema-fetch.mjs. Ohne STREAMING_API_URL schreibt der Lauf stattdessen
 * ./sport-vorschau.json -- zum lokalen Pruefen der Sender-Zuordnung.
 *
 * Aufruf:  STREAMING_API_URL=https://... SPORT_INGEST_SECRET=xxx node sport-fetch.mjs
 * Node >= 18 (globales fetch).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tvFuerSpiele } from './backend/lib/sportRechte.js';

const API = 'https://api.openligadb.de';
const STREAMING_API_URL = process.env.STREAMING_API_URL || '';
const SPORT_INGEST_SECRET = process.env.SPORT_INGEST_SECRET || '';

// Wie weit zurueck Spiele mitgeschickt werden: "gestern beendet" soll auf der
// Seite noch als Ergebnis auftauchen koennen, mehr Vergangenheit nicht.
const RUECKBLICK_TAGE = 3;

const RECHTE = JSON.parse(readFileSync(new URL('./sport-rechte.json', import.meta.url), 'utf8'));
const WETTBEWERBE = Object.keys(RECHTE.wettbewerbe);

// Fussball-Saisonlogik: Die Saison 2026/27 heisst bei OpenLigaDB "2026" und
// beginnt im Sommer -- ab Juli zaehlt das laufende Jahr, davor das Vorjahr.
// SPORT_SAISON uebersteuert (fuer Tests und Sonderfaelle).
function aktuelleSaison() {
  if (process.env.SPORT_SAISON) return Number(process.env.SPORT_SAISON);
  const jetzt = new Date();
  return jetzt.getUTCMonth() + 1 >= 7 ? jetzt.getUTCFullYear() : jetzt.getUTCFullYear() - 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openLigaDb(pfad) {
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      const res = await fetch(API + pfad, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`OpenLigaDB ${res.status} fuer ${pfad}`);
      return await res.json();
    } catch (err) {
      if (versuch === 2) throw err;
      await sleep(1500 * (versuch + 1));
    }
  }
  return null;
}

// Team-Logos auf https anheben: OpenLigaDB fuehrt teils http-Adressen
// (z.B. die deutsche Flagge via Wikimedia) -- der Browser blockt http-Bilder
// auf der https-Seite (Mixed Content), Wikimedia & Co. koennen alle https.
const httpsLogo = (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : null);

// Endergebnis (resultTypeID 2) bzw. bei laufenden Spielen der letzte Stand.
function ergebnis(match) {
  const alle = Array.isArray(match.matchResults) ? match.matchResults : [];
  const ende = alle.find((r) => r.resultTypeID === 2) || alle[alle.length - 1];
  if (!ende || ende.pointsTeam1 == null) return { heim: null, gast: null };
  return { heim: ende.pointsTeam1, gast: ende.pointsTeam2 };
}

async function holeWettbewerb(kuerzel, saison, grenzeIso) {
  const conf = RECHTE.wettbewerbe[kuerzel] || {};
  // OpenLigaDB-Kuerzel kann vom eigenen abweichen ('blsc' -> 'BLSupercup');
  // das eigene bleibt stabil in Datenbank und Oberflaeche.
  const olb = conf.olb || kuerzel;
  // Ganze Saison in einem Abruf; null/leer heisst: (noch) nicht gepflegt.
  const roh = await openLigaDb(`/getmatchdata/${olb}/${saison}`);
  if (!Array.isArray(roh) || !roh.length) return [];

  const spiele = roh
    .filter((m) => m && m.matchID && m.matchDateTimeUTC && m.team1 && m.team2)
    // nurTeams (z.B. Laenderspiele): nur Partien MIT diesen Teams -- die
    // uebrigen 40+ Nations-League-Spiele fremder Nationen sind fuer die
    // deutsche Senderfrage Rauschen.
    .filter((m) => !Array.isArray(conf.nurTeams) || conf.nurTeams.some(
      (t) => m.team1.teamName === t || m.team2.teamName === t))
    // OpenLigaDB traegt fuer noch unterminierte Spiele teils Platzhalter um
    // Mitternacht ein -- die bleiben drin (Datum stimmt, Zeit folgt), nur
    // Vergangenes vor der Grenze fliegt raus.
    .filter((m) => m.matchDateTimeUTC >= grenzeIso)
    // heim/gast fuer teams-Regeln (siehe sportRechte.js, Laenderspiele).
    .map((m) => ({ id: String(m.matchID), anstossUtc: m.matchDateTimeUTC,
                   heim: m.team1.teamName || '', gast: m.team2.teamName || '', roh: m }));

  const tvMap = tvFuerSpiele(RECHTE, kuerzel, saison, spiele);

  return spiele.map(({ id, anstossUtc, roh: m }) => {
    const erg = ergebnis(m);
    return {
      externalId: Number(id),
      wettbewerb: kuerzel,
      saison: String(saison),
      runde: m.group && m.group.groupName ? m.group.groupName : null,
      anstoss: anstossUtc,
      heim: m.team1.teamName || '',
      gast: m.team2.teamName || '',
      heimId: m.team1.teamId || null,
      gastId: m.team2.teamId || null,
      heimKurz: m.team1.shortName || null,
      gastKurz: m.team2.shortName || null,
      heimLogo: httpsLogo(m.team1.teamIconUrl),
      gastLogo: httpsLogo(m.team2.teamIconUrl),
      beendet: !!m.matchIsFinished,
      toreHeim: erg.heim,
      toreGast: erg.gast,
      tv: tvMap.get(id) || [],
    };
  });
}

async function main() {
  const saison = aktuelleSaison();
  const grenze = new Date(Date.now() - RUECKBLICK_TAGE * 86400000).toISOString();
  const items = [];

  for (const kuerzel of WETTBEWERBE) {
    // Aktuelle Saison plus Vorsaison (Saisonwechsel, siehe Kopfkommentar);
    // Duplikate kann es dabei nicht geben, matchIDs sind saisonuebergreifend
    // eindeutig und Vorsaison-Spiele liegen fast alle vor der Grenze.
    let anzahl = 0;
    for (const s of [saison, saison - 1]) {
      const spiele = await holeWettbewerb(kuerzel, s, grenze);
      items.push(...spiele);
      anzahl += spiele.length;
      await sleep(300);
    }
    console.log(`${kuerzel}: ${anzahl} Spiele (ab ${grenze.slice(0, 10)}).`);
  }

  const payload = {
    sender: RECHTE.sender,
    wettbewerbe: RECHTE.wettbewerbe,
    items,
  };

  if (!STREAMING_API_URL) {
    writeFileSync(new URL('./sport-vorschau.json', import.meta.url), JSON.stringify(payload, null, 2));
    console.log(`Ohne STREAMING_API_URL: ${items.length} Spiele nach sport-vorschau.json geschrieben.`);
    return;
  }
  if (!SPORT_INGEST_SECRET) {
    console.error('FEHLER: SPORT_INGEST_SECRET ist nicht gesetzt.');
    process.exit(1);
  }

  const res = await fetch(new URL('/api/sport/ingest', STREAMING_API_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SPORT_INGEST_SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
  console.log(`An Backend uebertragen: ${items.length} Spiele.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
