import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import path from 'node:path';

// Automatische Datenbank-Sicherung aus dem Backend-Container heraus.
//
// Der Weg ueber einen Cronjob auf dem Server funktioniert zwar (siehe
// scripts/backup.sh), muss aber einmal von Hand eingerichtet werden -- und wird
// beim Umzug auf eine neue Maschine gerne vergessen. Hier laeuft es mit dem
// Deployment mit: Container hoch, Sicherung aktiv.
//
// pg_dump verbindet sich ueber DATABASE_URL, also genauso wie das Backend
// selbst -- kein Docker-Zugriff noetig, keine zusaetzlichen Zugangsdaten. Das
// Postgres-Client-Paket steckt dafuer im Image (siehe backend/Dockerfile).
//
// Zwei Stufen, weil die Daten unterschiedlich wertvoll sind:
//   taeglich   Nur das, was sich NICHT wiederbeschaffen laesst.
//   monatlich  Alles, auch die aus TMDB abgeleiteten Caches -- fuer den Fall,
//              dass die Quelle ausfaellt.
const ZIEL = process.env.BACKUP_DIR || '/app/backups';
const BEHALTEN = {
  nutzer: Number(process.env.BACKUP_KEEP_DAILY || 14),
  voll: Number(process.env.BACKUP_KEEP_MONTHLY || 12),
};

// session bleibt bewusst draussen: reine Anmelde-Sitzungen. Nach einer
// Wiederherstellung meldet man sich eben neu an.
const NUTZERTABELLEN = [
  'titles', 'users', 'user_links', 'user_link_invites',
  'user_progress', 'user_hidden_titles', 'title_rating_stats', 'title_rating_stufen',
];

// Eine leere oder winzige Datei heisst: pg_dump ist gescheitert und hat den
// Fehler nur nach stderr geschrieben. Lieber laut abbrechen als eine
// unbrauchbare Sicherung liegen lassen, der man spaeter vertraut.
const MINDESTGROESSE = 1024;

function dateiname(art, jetzt) {
  const stempel = jetzt.toISOString().replace(/[:.]/g, '-');
  return `moviematch-${art}-${stempel}.sql.gz`;
}

async function dumpNach(datei, art) {
  const args = ['--no-owner', '--no-privileges'];
  if (art === 'nutzer') for (const t of NUTZERTABELLEN) args.push('--table=' + t);
  args.push(process.env.DATABASE_URL);

  await new Promise((fertig, fehler) => {
    const kind = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    kind.stderr.on('data', (d) => { stderr += String(d); });
    const ziel = createWriteStream(datei);
    kind.stdout.pipe(createGzip({ level: 9 })).pipe(ziel);
    ziel.on('error', fehler);
    kind.on('error', fehler);
    // Erst wenn die Datei vollstaendig geschrieben ist -- der Prozess kann
    // laengst beendet sein, waehrend gzip noch puffert.
    ziel.on('finish', () => {
      if (kind.exitCode === 0 || kind.exitCode === null) fertig();
      else fehler(new Error(`pg_dump beendet mit ${kind.exitCode}: ${stderr.trim()}`));
    });
  });
}

async function ausduennen(art) {
  const alle = (await readdir(ZIEL))
    .filter((n) => n.startsWith(`moviematch-${art}-`) && n.endsWith('.sql.gz'))
    .sort()                       // Zeitstempel im Namen ist sortierbar
    .reverse();                   // neueste zuerst
  for (const alt of alle.slice(BEHALTEN[art])) {
    await unlink(path.join(ZIEL, alt)).catch(() => {});
    console.log(`[sicherung] entfernt: ${alt}`);
  }
}

export async function sichere(art) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL fehlt');
  await mkdir(ZIEL, { recursive: true });
  const datei = path.join(ZIEL, dateiname(art, new Date()));
  await dumpNach(datei, art);

  const { size } = await stat(datei);
  if (size < MINDESTGROESSE) {
    await unlink(datei).catch(() => {});
    throw new Error(`Sicherung nur ${size} Bytes gross -- verworfen`);
  }
  console.log(`[sicherung] ${art}: ${datei} (${Math.round(size / 1024)} KB)`);
  await ausduennen(art);
}

export function starteSicherung() {
  if (process.env.BACKUP_DISABLED === '1') {
    console.log('[sicherung] deaktiviert (BACKUP_DISABLED=1)');
    return;
  }
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    // Am ersten Tag des Monats zusaetzlich die Vollsicherung. Bewusst nach der
    // taeglichen: Faellt die grosse aus (z.B. Platz voll), steht die kleine
    // trotzdem schon.
    sichere('nutzer')
      .then(() => (new Date().getUTCDate() === 1 ? sichere('voll') : null))
      .catch((err) => console.error('[sicherung] Lauf fehlgeschlagen:', err.message));
  };
  // Erst zwei Minuten nach dem Start: Ein frisch hochgefahrener Container soll
  // nicht gleichzeitig Migration, Aufraeumen und einen Dump stemmen.
  setTimeout(lauf, 120_000);
  setInterval(lauf, EIN_TAG);
}
