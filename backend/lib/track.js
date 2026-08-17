/* KPI-Ereignisse (docs/kpi.md). track() ist die EINZIGE Stelle, die in
   analytics_events schreibt -- so bleibt die Liste der Namen und die
   props-Disziplin (kein Freitext, keine personenbezogenen Daten) an einem Ort
   durchsetzbar.

   Wie bei lib/metrik.js gilt: Das Zaehlen darf NIE eine eigentliche Aktion
   scheitern lassen oder verzoegern -- track() faengt alles und meldet Fehler
   nur ins Protokoll. Aufrufer duerfen es deshalb ohne await benutzen. */
import { pool } from '../db/pool.js';

export const EVENT_NAMEN = [
  'app_opened',
  'user_signed_up',
  // Trichter des Onboardings (PLAN-ONBOARDING.md): NUR Schrittnummer und was
  // dort geschah ('fertig' | 'abgebrochen' | 'abgeschlossen'), keine Antworten.
  // Wird ausschliesslich serverseitig ausgeloest (routes/onboarding.js) und
  // steht deshalb NICHT in CLIENT_EVENT_NAMEN -- so lassen sich die Zahlen von
  // aussen weder ausloesen noch aufblasen.
  'onboarding_step',
  'group_created',
  'invite_sent',
  'invite_opened',
  'invite_accepted',
  'session_started',
  'title_rated',
  'match_completed',
  'affiliate_click',
  'affiliate_conversion',
  'subscription_started',
  'subscription_cancelled',
];

// Ereignisse, die der Client ueber POST /api/events melden darf (siehe
// routes/events.js). Alles andere entsteht serverseitig und kann vom Client
// weder ausgeloest noch aufgeblasen werden.
export const CLIENT_EVENT_NAMEN = [
  'app_opened',
  'invite_opened',
  'invite_accepted',
  'affiliate_click',
];

// anon_id fuer Ereignisse ohne Geraetebezug (Partner-Postbacks, Backfill).
export const SYSTEM_ANON_ID = 'system';

export async function track(name, { userId = null, anonId = null, groupId = null, sessionId = null, props = {} } = {}) {
  try {
    if (!EVENT_NAMEN.includes(name)) {
      console.error('track: unbekanntes Ereignis verworfen:', name);
      return;
    }
    await pool.query(
      `INSERT INTO analytics_events (name, user_id, anon_id, group_id, session_id, props)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        name,
        userId != null ? String(userId) : null,
        anonId != null ? String(anonId) : SYSTEM_ANON_ID,
        groupId != null ? String(groupId) : null,
        sessionId != null ? String(sessionId) : null,
        JSON.stringify(props || {}),
      ]
    );
  } catch (err) {
    console.error('track fehlgeschlagen:', name, err.message);
  }
}
