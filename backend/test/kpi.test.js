/* Tests fuer buildSnapshot (lib/kpi.js) mit einem festen Seed-Datensatz.
 *
 * Laufen gegen die Datenbank aus DATABASE_URL (lokal: docker compose,
 * Dienst "postgres"). Der Seed liegt bewusst im Januar 2020 -- weit vor jedem
 * echten Ereignis -- und traegt props.test_seed, worueber er am Ende
 * rueckstandsfrei geloescht wird. Die Sollwerte sind von Hand gerechnet und
 * stehen als Kommentar an jeder Pruefung.
 *
 * Berichtswoche: Mo 2020-01-06 .. So 2020-01-12 (Europe/Berlin).
 * Vorwoche (Kohorten): Mo 2019-12-30 .. So 2020-01-05. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { buildSnapshot } from '../lib/kpi.js';

const SEED = 'kpi-test-2020';
const FROM = '2020-01-06';
const TO = '2020-01-12';

// ts als Berlin-Ortszeit angeben -- die Tests rechnen in denselben Fenstern
// wie buildSnapshot.
function ereignis(name, tsBerlin, rest = {}) {
  return {
    name,
    ts: tsBerlin,
    user_id: rest.userId ?? null,
    anon_id: rest.anonId ?? 'seed-anon',
    session_id: rest.sessionId ?? null,
    props: { ...(rest.props || {}), test_seed: SEED },
  };
}

async function einspielen(events) {
  for (const e of events) {
    await pool.query(
      `INSERT INTO analytics_events (name, ts, user_id, anon_id, session_id, props)
       VALUES ($1, $2::timestamp AT TIME ZONE 'Europe/Berlin', $3, $4, $5, $6)`,
      [e.name, e.ts, e.user_id, e.anon_id, e.session_id, JSON.stringify(e.props)]
    );
  }
}

async function aufraeumen() {
  await pool.query(`DELETE FROM analytics_events WHERE props->>'test_seed' = $1`, [SEED]);
}

test('buildSnapshot: Sollwerte gegen festen Seed', async (t) => {
  await aufraeumen();

  const events = [
    /* ---- Berichtswoche: 4 Anmeldungen, 1 davon geworben ----
       invited_share = 1/4 = 0.25 */
    ereignis('user_signed_up', '2020-01-06 10:00:00', { userId: 'u1', anonId: 'a1', props: { source: 'organic', invite_id: null, was_guest: false } }),
    ereignis('user_signed_up', '2020-01-07 10:00:00', { userId: 'u2', anonId: 'a2', props: { source: 'referral', invite_id: 'inv-x', was_guest: false } }),
    ereignis('user_signed_up', '2020-01-08 10:00:00', { userId: 'u3', anonId: 'a3', props: { source: 'organic', invite_id: null, was_guest: false } }),
    ereignis('user_signed_up', '2020-01-09 10:00:00', { userId: 'u4', anonId: 'a4', props: { source: 'organic', invite_id: null, was_guest: false } }),

    /* ---- Vorwochen-Kohorte fuer activation_rate und d7: 2 Anmeldungen ----
       k1 erreicht binnen 24 h einen Match, k2 nicht.
       activation_rate = 1/2 = 0.5 */
    ereignis('user_signed_up', '2019-12-30 12:00:00', { userId: 'k1', anonId: 'ka1', props: { source: 'organic', invite_id: null, was_guest: false } }),
    ereignis('user_signed_up', '2019-12-31 12:00:00', { userId: 'k2', anonId: 'ka2', props: { source: 'organic', invite_id: null, was_guest: false } }),
    ereignis('session_started', '2019-12-30 18:00:00', { userId: 'k1', anonId: 'ka1', sessionId: 's1', props: { participant_count: 1 } }),
    ereignis('title_rated', '2019-12-30 18:05:00', { userId: 'k1', anonId: 'ka1', sessionId: 's1', props: { title_id: 7, verdict: 'yes', participant_count: 2 } }),
    ereignis('match_completed', '2019-12-30 18:10:00', { anonId: 'gast-1', sessionId: 's1', props: { participant_count: 2, title_id: 7 } }),

    /* ---- d7: Rueckkehr an Tag 5-7 nach Anmeldung, gemessen an anon_id.
       ka1 (Anmeldung 30.12.) oeffnet am 05.01. wieder -> Tag 6, zaehlt.
       ka2 oeffnet nur am Anmeldetag (Tag 0), zaehlt nicht.
       d7 = 1/2 = 0.5 */
    ereignis('app_opened', '2019-12-30 12:01:00', { anonId: 'ka1', props: { platform: 'desktop' } }),
    ereignis('app_opened', '2019-12-31 12:01:00', { anonId: 'ka2', props: { platform: 'desktop' } }),
    ereignis('app_opened', '2020-01-05 09:00:00', { anonId: 'ka1', props: { platform: 'desktop' } }),

    /* ---- invite_accept_rate: 2 Einladungen im Fenster versendet.
       inv-a: 1 Annahme nach 2 Tagen (zaehlt), 1 Annahme nach 20 Tagen
       (zaehlt NICHT, >14 Tage). inv-b: keine Annahme.
       invite_accept_rate = 1/2 = 0.5 */
    ereignis('invite_sent', '2020-01-06 11:00:00', { userId: 'u1', anonId: 'a1', props: { invite_id: 'inv-a', channel: 'referral' } }),
    ereignis('invite_sent', '2020-01-10 11:00:00', { userId: 'u3', anonId: 'a3', props: { invite_id: 'inv-b', channel: 'share' } }),
    ereignis('invite_accepted', '2020-01-08 11:00:00', { anonId: 'g1', props: { invite_id: 'inv-a', guest: true } }),
    ereignis('invite_accepted', '2020-01-26 11:00:00', { anonId: 'g2', props: { invite_id: 'inv-a', guest: true } }),
  ];

  await einspielen(events);
  t.after(aufraeumen);

  const { snapshot, gruende } = await buildSnapshot(FROM, TO);
  const m = snapshot.metrics;

  assert.equal(snapshot.period.from, FROM);
  assert.equal(snapshot.period.to, TO);

  // 4 Anmeldungen im Fenster, 1 mit invite_id -> 0.25
  assert.equal(m.new_users_week, 4);
  assert.equal(m.invited_share, 0.25);

  // Vorwochen-Kohorte {k1, k2}, nur k1 binnen 24 h an einem Match beteiligt
  assert.equal(m.activation_rate, 0.5);

  // Annahmen binnen 14 Tagen auf im Fenster versendete Einladungen: 1 von 2
  assert.equal(m.invite_accept_rate, 0.5);

  // Kohorte {ka1, ka2}: nur ka1 kehrt an Tag 5-7 zurueck
  assert.equal(m.d7, 0.5);

  // Regeln: Gruppen-Kennzahlen bewusst null, Prozentwerte als 0..1
  assert.equal(m.active_groups, null);
  assert.equal(m.group_retention_m1, null);
  assert.ok(gruende.active_groups);

  // cac ohne marketing_spend-Zeile: null, nicht 0
  assert.equal(m.cac, null);
  assert.ok(gruende.cac.includes('marketing_spend'));
});

test('buildSnapshot: leeres Fenster liefert null statt geratener Werte', async () => {
  // Woche weit vor jedem Ereignis: Basis-Ereignisse existieren dort nicht.
  const { snapshot } = await buildSnapshot('2010-01-04', '2010-01-10');
  const m = snapshot.metrics;
  assert.equal(m.invited_share, null);
  assert.equal(m.activation_rate, null);
  assert.equal(m.invite_accept_rate, null);
  assert.equal(m.d7, null);
  // Monetarisierung ist dagegen eine ehrliche 0 (Produkte existieren nicht)
  assert.equal(m.paying_users, 0);
  assert.equal(m.mrr, 0);
});

test.after(async () => { await pool.end(); });
