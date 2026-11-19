// Universal Links (iOS) und App Links (Android): Dateien unter /.well-known.
// Team-ID und Zertifikat-Fingerabdruck kommen aus der Umgebung; ohne sie
// liefern die Routen 404 (Funktion aus, bis die Entwicklerkonten stehen).
const BUNDLE_ID = process.env.APP_BUNDLE_ID || 'de.movietaste.app';

// Nur App, geteilte Titel und Einladungen, bewusst keine SEO-Seiten.
export function aasaBauen(teamId = process.env.APPLE_TEAM_ID) {
  if (!teamId) return null;
  return {
    applinks: {
      details: [{
        appIDs: [`${teamId}.${BUNDLE_ID}`],
        components: [
          { '/': '/app', comment: 'App' },
          { '/': '/app/*' },
          { '/': '/t/*', comment: 'Geteilter Titel' },
          { '/': '/', '?': { einladung: '?*' }, comment: 'Einladung' },
          { '/': '/', '?': { ref: '?*' }, comment: 'Werbe-Link' },
        ],
      }],
    },
  };
}

export function assetlinksBauen(sha256 = process.env.ANDROID_CERT_SHA256) {
  if (!sha256) return null;
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: BUNDLE_ID,
      sha256_cert_fingerprints: sha256.split(',').map((s) => s.trim()).filter(Boolean),
    },
  }];
}

export function registriereAppLinks(app) {
  const senden = (bauen) => (req, res) => {
    const body = bauen();
    if (!body) return res.status(404).type('txt').send('Not found');
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/json').send(JSON.stringify(body));
  };
  app.get('/.well-known/apple-app-site-association', senden(aasaBauen));
  app.get('/.well-known/assetlinks.json', senden(assetlinksBauen));
}
