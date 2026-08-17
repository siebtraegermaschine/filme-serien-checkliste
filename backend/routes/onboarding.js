import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { track } from '../lib/track.js';
import {
  SCHAUVERHALTEN, GENRES_HAEUFIG, GENRES_THEMEN, GENRES_WEITERE,
  TITEL_ZIEL, TITEL_MINDESTENS, GENRES_MINDESTENS, ANLAEUFE_MAX, SCHRITTE_GESAMT,
  sauberSchauverhalten, sauberGenres, titelStufe, aggregatZaehlen,
} from '../lib/onboarding.js';

/* Onboarding nach der ersten Anmeldung (PLAN-ONBOARDING.md).

   Die fuenf Schritte: 1 Titel bewerten, 2 Schauverhalten, 3 Genres,
   4 Streaminganbieter, 5 Kinos.

   Schritt 1, 4 und 5 speichern ihre Daten NICHT hier -- sie liegen an ihrer
   angestammten Stelle (user_progress, users.watch_provider_ids, user_kinos).
   Diese Route prueft nur, ob dort inzwischen etwas steht, vermerkt den
   Fortschritt und zaehlt die anonymen Aggregate hoch. Ein zweiter Speicherort
   fuer dieselbe Angabe waere eine zweite Wahrheit. */

const router = createAsyncRouter();
router.use(requireAuth);

const LEER = { schritt: 0, anlaeufe: 0, schauverhalten: [], genres: [], abgeschlossen: false };

function standAusZeile(row) {
  if (!row) return { ...LEER };
  return {
    schritt: row.schritt,
    anlaeufe: row.anlaeufe,
    schauverhalten: row.schauverhalten || [],
    genres: row.genres || [],
    abgeschlossen: !!row.abgeschlossen_am,
  };
}

// Legt die Zeile bei der ersten Beruehrung an. ON CONFLICT DO NOTHING statt
// einer vorherigen Abfrage: zwei gleichzeitige Anfragen (Fenster oeffnet,
// erster Schritt speichert) sollen sich nicht gegenseitig ueberholen.
async function zeileSichern(client, userId) {
  await client.query(
    `INSERT INTO user_onboarding (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function standLesen(userId) {
  const { rows } = await pool.query(
    `SELECT schritt, anlaeufe, schauverhalten, genres, abgeschlossen_am
       FROM user_onboarding WHERE user_id = $1`,
    [userId]
  );
  return standAusZeile(rows[0]);
}

async function regionLesen(client, userId) {
  const { rows } = await client.query('SELECT region FROM users WHERE id = $1', [userId]);
  return rows[0]?.region || null;
}

/* GET /api/onboarding
   Stand UND Antwortmoeglichkeiten. Beides in einer Antwort, weil das Fenster
   ohne beides nichts anzeigen kann -- und weil die Listen damit nur an einer
   Stelle gepflegt werden (siehe lib/onboarding.js). */
router.get('/', async (req, res) => {
  const stand = await standLesen(req.session.userId);
  res.json({
    ...stand,
    // Faellig, solange nicht abgeschlossen und noch Anlaeufe offen sind.
    faellig: !stand.abgeschlossen && stand.anlaeufe < ANLAEUFE_MAX,
    optionen: {
      schauverhalten: SCHAUVERHALTEN,
      genresHaeufig: GENRES_HAEUFIG,
      genresThemen: GENRES_THEMEN,
      genresWeitere: GENRES_WEITERE,
    },
    grenzen: {
      titelZiel: TITEL_ZIEL,
      titelMindestens: TITEL_MINDESTENS,
      genresMindestens: GENRES_MINDESTENS,
      schritteGesamt: SCHRITTE_GESAMT,
      anlaeufeMax: ANLAEUFE_MAX,
    },
  });
});

/* Was ein Schritt zum Abschluss braucht, und was er ins Aggregat gibt.
   Rueckgabe: { antworten } bei Erfolg, { fehler } wenn der Schritt (noch)
   nicht erfuellt ist. Gelesen wird dabei jeweils die ECHTE Ablage -- nicht,
   was der Browser behauptet. */
const SCHRITT_PRUEFUNG = {
  // Titel bewerten: gezaehlt wird, was tatsaechlich auf dem Konto steht.
  async 1(client, userId) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM user_progress WHERE user_id = $1 AND seen`,
      [userId]
    );
    const n = rows[0].n;
    if (n < TITEL_MINDESTENS) return { fehler: 'zu_wenige_titel' };
    return { frage: 'titel', antworten: [titelStufe(n)] };
  },

  async 2(client, userId, daten) {
    const werte = sauberSchauverhalten(daten?.schauverhalten);
    if (!werte) return { fehler: 'auswahl_fehlt' };
    await client.query(
      'UPDATE user_onboarding SET schauverhalten = $2 WHERE user_id = $1',
      [userId, werte]
    );
    return { frage: 'schauverhalten', antworten: werte };
  },

  async 3(client, userId, daten) {
    const werte = sauberGenres(daten?.genres);
    if (!werte) return { fehler: 'zu_wenige_genres' };
    await client.query(
      'UPDATE user_onboarding SET genres = $2 WHERE user_id = $1',
      [userId, werte]
    );
    return { frage: 'genre', antworten: werte };
  },

  /* Anbieter: NULL heisst "noch nie eingestellt" -- dann hat die Person den
     Schritt nicht beantwortet. Das LEERE Array ist dagegen eine gueltige
     Antwort ("Ich nutze keinen") und steht im bestehenden Modell ohnehin fuer
     "nicht filtern". */
  async 4(client, userId) {
    const { rows } = await client.query(
      'SELECT watch_provider_ids FROM users WHERE id = $1',
      [userId]
    );
    const ids = rows[0]?.watch_provider_ids;
    if (!Array.isArray(ids)) return { fehler: 'anbieter_fehlen' };
    return { frage: 'anbieter', antworten: ids.length ? ids.map(String) : ['keine'] };
  },

  /* Kinos: keine Untergrenze. Wer nicht ins Kino geht -- oder in dessen
     Umkreis keines liegt -- beantwortet den Schritt mit "Ich gehe nicht ins
     Kino", und das ist eine Antwort, kein Ueberspringen. Gezaehlt wird nur der
     ORT, nie das einzelne Kino (siehe schema.sql). */
  async 5(client, userId) {
    const { rows } = await client.query(
      `SELECT DISTINCT k.ort FROM user_kinos uk JOIN kinos k ON k.id = uk.kino_id
        WHERE uk.user_id = $1 AND k.ort IS NOT NULL`,
      [userId]
    );
    const orte = rows.map((r) => r.ort).filter(Boolean);
    return { frage: 'kino_ort', antworten: orte.length ? orte : ['keins'] };
  },
};

/* PUT /api/onboarding/schritt  { schritt, daten }
   Einen Schritt abschliessen. */
router.put('/schritt', async (req, res) => {
  const schritt = Number(req.body?.schritt);
  if (!Number.isInteger(schritt) || schritt < 1 || schritt > SCHRITTE_GESAMT) {
    return res.status(400).json({ error: 'invalid_step' });
  }

  const userId = req.session.userId;
  const client = await pool.connect();
  let ergebnis;
  let gezaehlt = false;
  try {
    await client.query('BEGIN');
    await zeileSichern(client, userId);
    // Zeile sperren: Das Aggregat darf genau einmal je Schritt hochzaehlen,
    // auch wenn zwei Klicks gleichzeitig ankommen.
    const { rows } = await client.query(
      'SELECT schritt FROM user_onboarding WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const bisher = rows[0].schritt;

    ergebnis = await SCHRITT_PRUEFUNG[schritt](client, userId, req.body?.daten);
    if (ergebnis.fehler) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: ergebnis.fehler });
    }

    /* Nur beim ERSTEN Erreichen zaehlen. Wer ueber den Zurueck-Pfeil eine
       Antwort aendert, korrigiert seine eigenen Daten -- die anonyme Statistik
       aber nicht mehr, sie kennt die alte Antwort nicht mehr. Doppelt zaehlen
       waere schlimmer als die eine ueberholte Zeile. */
    if (schritt > bisher) {
      await aggregatZaehlen(client, ergebnis.frage, ergebnis.antworten,
        await regionLesen(client, userId));
      gezaehlt = true;
      await client.query(
        'UPDATE user_onboarding SET schritt = $2 WHERE user_id = $1',
        [userId, schritt]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Ohne await: Zaehlen darf den Ablauf nie verzoegern (siehe lib/track.js).
  if (gezaehlt) {
    track('onboarding_step', {
      userId, anonId: req.anonId, props: { schritt, aktion: 'fertig' },
    });
  }
  res.json(await standLesen(userId));
});

/* POST /api/onboarding/abbruch
   Das Fenster wurde per X geschlossen. Zaehlt den Anlauf hoch; ab
   ANLAEUFE_MAX kommt es nicht mehr von selbst. */
router.post('/abbruch', async (req, res) => {
  const userId = req.session.userId;
  const client = await pool.connect();
  let stand;
  try {
    await client.query('BEGIN');
    await zeileSichern(client, userId);
    const { rows } = await client.query(
      `UPDATE user_onboarding SET anlaeufe = least(anlaeufe + 1, $2) WHERE user_id = $1
       RETURNING schritt, anlaeufe, schauverhalten, genres, abgeschlossen_am`,
      [userId, ANLAEUFE_MAX]
    );
    stand = standAusZeile(rows[0]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  track('onboarding_step', {
    userId, anonId: req.anonId,
    props: { schritt: stand.schritt + 1, aktion: 'abgebrochen', anlauf: stand.anlaeufe },
  });
  res.json(stand);
});

/* POST /api/onboarding/fertig
   Abschluss. Verlangt, dass alle Schritte durch sind -- sonst waere der
   Prozess ueber einen nachgebauten Aufruf abkuerzbar. */
router.post('/fertig', async (req, res) => {
  const userId = req.session.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await zeileSichern(client, userId);
    const { rows } = await client.query(
      `SELECT schritt, abgeschlossen_am FROM user_onboarding WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (rows[0].schritt < SCHRITTE_GESAMT) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'nicht_vollstaendig' });
    }
    // Doppelter Abschluss (zweiter Klick, Neuladen) zaehlt nicht noch einmal.
    if (!rows[0].abgeschlossen_am) {
      await client.query(
        'UPDATE user_onboarding SET abgeschlossen_am = now() WHERE user_id = $1',
        [userId]
      );
      await aggregatZaehlen(client, 'abschluss', ['fertig'], await regionLesen(client, userId));
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  track('onboarding_step', {
    userId, anonId: req.anonId, props: { schritt: SCHRITTE_GESAMT, aktion: 'abgeschlossen' },
  });
  res.json(await standLesen(userId));
});

export default router;
