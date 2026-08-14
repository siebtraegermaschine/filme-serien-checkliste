/* Hand- und Testversand der Wochenend-Mail (lib/wochenendmail.js).
 *
 * Aufruf im Backend-Verzeichnis:
 *
 *   npm run wochenendmail -- --test adresse@x.y            # Mail des passenden
 *       Kontos an die Testadresse schicken, OHNE Wiederholungs-Vermerke.
 *       Konto-Wahl: --konto, sonst das Konto mit der Testadresse, sonst das
 *       Konto mit den meisten Markierungen (damit die Mail Inhalt hat).
 *   npm run wochenendmail -- --test adresse@x.y --konto konto@x.y
 *   npm run wochenendmail -- --alle                        # echter Lauf von
 *       Hand: an alle Opt-in-Konten, MIT Vermerken (wie der Donnerstags-Cron).
 *
 * Der automatische Donnerstags-Versand haengt an WOCHENEND_MAIL_AKTIV=1
 * (siehe server.js) und ist standardmaessig aus. */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { sendMail } from '../lib/mailer.js';
import { wochenendMailBauen, wochenendLauf } from '../lib/wochenendmail.js';

function argWert(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  if (process.argv.includes('--alle')) {
    await wochenendLauf();
    return;
  }

  const testAn = argWert('--test');
  if (!testAn || !testAn.includes('@')) {
    console.error('Aufruf: npm run wochenendmail -- --test adresse@x.y [--konto konto@x.y] | --alle');
    process.exitCode = 1;
    return;
  }

  const kontoMail = argWert('--konto') || testAn;
  let { rows } = await pool.query(
    `SELECT id, email, sprache, region, watch_provider_ids FROM users WHERE email = $1`,
    [kontoMail]
  );
  if (!rows.length) {
    ({ rows } = await pool.query(
      `SELECT u.id, u.email, u.sprache, u.region, u.watch_provider_ids
         FROM users u
         JOIN user_progress up ON up.user_id = u.id
        GROUP BY u.id ORDER BY COUNT(*) DESC LIMIT 1`
    ));
    if (!rows.length) { console.error('Kein Konto mit Markierungen gefunden.'); process.exitCode = 1; return; }
    console.log(`Kein Konto "${kontoMail}" -- nehme das Konto mit den meisten Markierungen (${rows[0].email}).`);
  }

  const mail = await wochenendMailBauen(rows[0]);
  if (!mail) { console.log('Fuer dieses Konto gaebe es diese Woche keine Mail (nichts zu melden).'); return; }

  console.log(`\n--- Betreff: ${mail.betreff}\n\n${mail.text}\n---\n`);
  await sendMail({ to: testAn, subject: `[TEST] ${mail.betreff}`, text: mail.text });
  console.log(`Testmail an ${testAn} verschickt (Konto: ${rows[0].email}, keine Vermerke geschrieben).`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
