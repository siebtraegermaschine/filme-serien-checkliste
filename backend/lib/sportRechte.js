/*
 * Regelwerk fuer die Sender-Zuordnung im Sport-Bereich (siehe PLAN-SPORT.md
 * und sport-rechte.json in der Repo-Wurzel).
 *
 * Kernidee: In Deutschland sind die Uebertragungsrechte pro Wettbewerb und
 * Anstoss-Slot fest vergeben -- aus Wochentag und Uhrzeit (Europe/Berlin)
 * folgt der Sender fuer ~90% der Spiele deterministisch. Der Rest (Amazons
 * CL-Dienstagspick, Free-TV-Spiele in Pokal/Europa League) steht als
 * Ausnahme je Spiel in der Matrix und wird woechentlich gepflegt.
 *
 * Genutzt von sport-fetch.mjs (GitHub Action) -- bewusst in backend/lib wie
 * anbieter.js, damit Tests (backend/test) und ggf. spaetere Serverpfade
 * dieselbe Logik verwenden.
 */

// Wochentag + Uhrzeit eines UTC-Zeitpunkts in Berliner ORTSZEIT. Die Regeln
// meinen die Anstosszeit, wie sie im Fernsehprogramm steht -- UTC laege im
// Winter eine, im Sommer zwei Stunden daneben (Sa 15:30 waere 13:30/14:30).
const BERLIN_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export function berlinTagZeit(anstossUtc) {
  const teile = {};
  for (const t of BERLIN_FMT.formatToParts(new Date(anstossUtc))) teile[t.type] = t.value;
  return {
    tag: teile.weekday,                            // 'Mon' ... 'Sun'
    zeit: `${teile.hour}:${teile.minute}`,         // '15:30'
    datum: `${teile.year}-${teile.month}-${teile.day}`,
  };
}

// Saison-Block: exakt, sonst der juengste davor (eine neue Saison ohne
// eigenen Block erbt die letzten bekannten Regeln -- besser als gar keine
// Zuordnung; nach einem Rechtewechsel MUSS ein neuer Block angelegt werden,
// siehe _hinweis in sport-rechte.json), sonst der aelteste vorhandene.
export function saisonBlock(rechte, saison) {
  const alle = Object.keys(rechte.saisons || {}).sort();
  if (!alle.length) return null;
  const s = String(saison);
  if (rechte.saisons[s]) return rechte.saisons[s];
  const davor = alle.filter((a) => a < s);
  return rechte.saisons[davor.length ? davor[davor.length - 1] : alle[0]];
}

function regelPasst(regel, tagZeit, spiel) {
  // teams: Regel greift nur fuer Partien MIT einem dieser Teams -- gebraucht
  // fuer die Laenderspiele (Deutschland-Spiele sind Free-TV je Ausnahme, der
  // Rest der Nations League laeuft pauschal bei DAZN).
  if (regel.teams && !(regel.teams.includes(spiel.heim) || regel.teams.includes(spiel.gast))) return false;
  if (regel.tag && !regel.tag.includes(tagZeit.tag)) return false;
  if (regel.zeit && regel.zeit !== tagZeit.zeit) return false;
  return true;
}

/*
 * Sender fuer ALLE Spiele eines Wettbewerbs einer Saison auf einmal.
 * spiele: [{ id, anstossUtc }] -- id als String (Schluessel der Ausnahmen).
 * Ergebnis: Map id -> [{ s, typ?, unsicher? }].
 *
 * Warum alle auf einmal statt Spiel fuer Spiel: Das 'unsicher' einer Regel
 * (CL-Dienstag: DAZN zeigt alles AUSSER Amazons Pick) loest sich auf, sobald
 * fuer denselben Ortstag eine 'ersetzen'-Ausnahme eingetragen ist -- dann ist
 * der Pick bekannt und die uebrigen Spiele des Tages sind sicher beim
 * Regel-Sender. Das sieht man nur mit Blick auf den ganzen Spieltag.
 */
export function tvFuerSpiele(rechte, wettbewerb, saison, spiele) {
  const block = saisonBlock(rechte, saison);
  const conf = block ? block[wettbewerb] : null;
  const ergebnis = new Map();
  if (!conf) {
    for (const s of spiele) ergebnis.set(String(s.id), []);
    return ergebnis;
  }
  const ausnahmen = conf.ausnahmen || {};

  // Ortstage, an denen eine 'ersetzen'-Ausnahme haengt (= der Pick des Tages
  // ist eingetragen) -- dort werden unsichere Regel-Treffer sicher.
  const tageMitPick = new Set();
  for (const s of spiele) {
    const a = ausnahmen[String(s.id)];
    if (a && Array.isArray(a.ersetzen)) tageMitPick.add(berlinTagZeit(s.anstossUtc).datum);
  }

  for (const spiel of spiele) {
    const id = String(spiel.id);
    const tz = berlinTagZeit(spiel.anstossUtc);
    const regel = (conf.regeln || []).find((r) => regelPasst(r, tz, spiel));
    let tv = regel ? regel.tv.map((e) => ({ ...e })) : [];
    let unsicher = !!(regel && regel.unsicher) && !tageMitPick.has(tz.datum);

    const ausnahme = ausnahmen[id];
    if (ausnahme) {
      if (Array.isArray(ausnahme.ersetzen)) { tv = ausnahme.ersetzen.map((e) => ({ ...e })); unsicher = false; }
      if (Array.isArray(ausnahme.zusatz)) {
        // Zusatz ergaenzt (Free-TV parallel zum Abo-Sender), ersetzt nie --
        // und macht die Zuordnung als Ganzes zur gepruefen Angabe.
        for (const e of ausnahme.zusatz) if (!tv.some((v) => v.s === e.s)) tv.push({ ...e });
        unsicher = false;
      }
    }
    if (unsicher) for (const e of tv) e.unsicher = true;
    ergebnis.set(id, tv);
  }
  return ergebnis;
}
