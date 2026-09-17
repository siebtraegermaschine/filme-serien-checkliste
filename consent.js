/* Cookie-Banner und Google Analytics fuer ALLE Seiten von movietaste.de
   (17.09.2026).

   Eine Datei fuer alles, damit keine Seite ohne Banner oder mit Google ohne
   Einwilligung ausgeliefert wird: die App (index.html, auch /t/...), die
   SEO-Seiten (backend/lib/seoRender.js, Kopf jeder Seite) und die statischen
   Seiten (Impressum, Datenschutz, ...). backend/test/consent.test.js prueft,
   dass jede HTML-Seite im Repo-Wurzelordner und das SEO-Grundgeruest diese
   Datei einbinden -- eine neue Seite ohne sie faellt dort auf.

   Rechtlicher Rahmen (Datenschutzerklaerung Abschnitt 4): Google Analytics
   liest und speichert Informationen auf dem Geraet und uebermittelt Daten an
   Google (USA). Das braucht vorher eine Einwilligung (§ 25 Abs. 1 TDDDG,
   Art. 6 Abs. 1 lit. a DSGVO). Deshalb wird das Google-Skript OHNE "Zustimmen"
   gar nicht erst geladen -- kein Aufruf bei Google, kein Cookie, auch keine
   cookielosen Signale (Consent Mode "basic"). Bewusst strenger als der
   "advanced"-Modus bei CouchUltras, der das Skript immer laedt.

   "Ablehnen" und "Zustimmen" stehen gleichwertig nebeneinander. Die Wahl
   liegt im localStorage (mt.consent: 'ja' | 'nein') und gilt fuer die ganze
   Domain. Widerruf ueber jeden Link mit data-cookie-einstellungen; hat eine
   Seite keinen, haengt diese Datei selbst einen ans Seitenende. Beim Widerruf
   werden die _ga-Cookies geloescht und Google Analytics fuer die Seite
   abgeschaltet. */
(function () {
  'use strict';

  var GA_MESSSTELLE = 'G-478EZLZ8NV';
  var KEY = 'mt.consent';

  if (window.MMConsent) return; // doppelt eingebunden

  /* ---- Texte, sieben Sprachen wie die App. FR/ES/IT/NL/PT maschinell
     angelehnt an DE/EN -- gehoeren in die Muttersprachler-Durchsicht. ---- */
  var TEXTE = {
    de: {
      text: 'Wir möchten mit Google Analytics messen, wie MovieMatch genutzt wird. Dafür setzt Google Cookies und erhält Nutzungsdaten, auch in den USA – nur mit deiner Zustimmung.',
      mehr: 'Mehr in der Datenschutzerklärung',
      ja: 'Zustimmen', nein: 'Ablehnen', einstellungen: 'Cookie-Einstellungen',
    },
    en: {
      text: 'We would like to use Google Analytics to measure how MovieMatch is used. Google sets cookies and receives usage data for this, including in the USA – only with your consent.',
      mehr: 'More in the privacy policy',
      ja: 'Accept', nein: 'Decline', einstellungen: 'Cookie settings',
    },
    fr: {
      text: 'Nous souhaitons mesurer l’utilisation de MovieMatch avec Google Analytics. Google dépose pour cela des cookies et reçoit des données d’utilisation, y compris aux États-Unis – uniquement avec ton accord.',
      mehr: 'En savoir plus dans la politique de confidentialité',
      ja: 'Accepter', nein: 'Refuser', einstellungen: 'Paramètres des cookies',
    },
    es: {
      text: 'Queremos medir con Google Analytics cómo se usa MovieMatch. Para ello, Google instala cookies y recibe datos de uso, también en EE. UU., solo con tu consentimiento.',
      mehr: 'Más en la política de privacidad',
      ja: 'Aceptar', nein: 'Rechazar', einstellungen: 'Configuración de cookies',
    },
    it: {
      text: 'Vorremmo misurare con Google Analytics come viene usato MovieMatch. A tal fine Google imposta cookie e riceve dati di utilizzo, anche negli USA – solo con il tuo consenso.',
      mehr: 'Maggiori informazioni nell’informativa sulla privacy',
      ja: 'Accetta', nein: 'Rifiuta', einstellungen: 'Impostazioni cookie',
    },
    nl: {
      text: 'We willen met Google Analytics meten hoe MovieMatch wordt gebruikt. Google plaatst daarvoor cookies en ontvangt gebruiksgegevens, ook in de VS – alleen met jouw toestemming.',
      mehr: 'Meer in de privacyverklaring',
      ja: 'Accepteren', nein: 'Weigeren', einstellungen: 'Cookie-instellingen',
    },
    pt: {
      text: 'Queremos medir com o Google Analytics como o MovieMatch é usado. Para isso, o Google define cookies e recebe dados de uso, inclusive nos EUA – apenas com o teu consentimento.',
      mehr: 'Mais na política de privacidade',
      ja: 'Aceitar', nein: 'Recusar', einstellungen: 'Configurações de cookies',
    },
  };

  function sprache() {
    var kandidaten = [];
    try { kandidaten.push(localStorage.getItem('mt.sprache')); } catch (e) {}
    kandidaten.push(document.documentElement.lang, navigator.language);
    for (var i = 0; i < kandidaten.length; i++) {
      var s = String(kandidaten[i] || '').toLowerCase().slice(0, 2);
      if (TEXTE[s]) return s;
    }
    return 'en';
  }
  var SPRACHE = sprache();
  var T = TEXTE[SPRACHE];

  function stand() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function speichern(wahl) {
    try { localStorage.setItem(KEY, wahl); } catch (e) {}
  }

  /* ---- Google Analytics: erst nach "Zustimmen" ---- */
  var gaGeladen = false;
  function gaLaden() {
    if (gaGeladen || !GA_MESSSTELLE) return;
    gaGeladen = true;
    window['ga-disable-' + GA_MESSSTELLE] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    window.gtag('js', new Date());
    // Google-Signale und Werbe-Personalisierung aus -- zusaetzlich zur
    // Einstellung in der Property (Datenschutzerklaerung Abschnitt 4).
    window.gtag('config', GA_MESSSTELLE, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MESSSTELLE);
    document.head.appendChild(s);
  }
  function gaAbschalten() {
    window['ga-disable-' + GA_MESSSTELLE] = true;
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    // Die Google-Cookies sind nicht httpOnly -- sie lassen sich hier loeschen.
    // Google setzt sie auf die Hauptdomain (.movietaste.de), deshalb beide Varianten.
    try {
      var host = location.hostname;
      var domains = ['', host, '.' + host.replace(/^www\./, '')];
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (!/^_ga/.test(name)) return;
        domains.forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      });
    } catch (e) {}
  }

  /* ---- Banner ---- */
  var STIL = '' +
    '.mm-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;' +
    'background:var(--card,#171c24);color:var(--text,#e8eaed);border:1px solid var(--accent,#e6b34c);border-radius:12px;' +
    'padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:left}' +
    '.mm-consent[hidden]{display:none}' +
    '.mm-consent p{margin:0 0 12px;font-size:13.5px;color:inherit}' +
    '.mm-consent a{color:var(--accent,#e6b34c)}' +
    '.mm-consent-knoepfe{display:flex;gap:10px}' +
    '.mm-consent-knoepfe button{flex:1;border-radius:8px;padding:9px 14px;font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;' +
    'border:1px solid var(--border,#2a323e);background:var(--card,#171c24);color:var(--text,#e8eaed)}' +
    '.mm-consent-knoepfe .mm-consent-ja{background:var(--accent-soft,rgba(230,179,76,.15));border-color:var(--accent,#e6b34c);color:var(--accent,#e6b34c)}' +
    '.mm-cookie-fuss{text-align:center;font-size:12px;margin:24px 0 16px}' +
    '[data-cookie-einstellungen]{cursor:pointer}';

  var banner = null;
  function bannerBauen() {
    if (banner) return banner;
    var style = document.createElement('style');
    style.textContent = STIL;
    document.head.appendChild(style);

    banner = document.createElement('div');
    banner.className = 'mm-consent';
    banner.id = 'mmConsent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', T.einstellungen);
    banner.hidden = true;

    var p = document.createElement('p');
    p.appendChild(document.createTextNode(T.text + ' '));
    var a = document.createElement('a');
    a.href = SPRACHE === 'de' ? '/datenschutz.html' : '/privacy.html';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = T.mehr;
    p.appendChild(a);

    var knoepfe = document.createElement('div');
    knoepfe.className = 'mm-consent-knoepfe';
    var nein = document.createElement('button');
    nein.type = 'button';
    nein.className = 'mm-consent-nein';
    nein.textContent = T.nein;
    nein.onclick = function () { wahl('nein'); };
    var ja = document.createElement('button');
    ja.type = 'button';
    ja.className = 'mm-consent-ja';
    ja.textContent = T.ja;
    ja.onclick = function () { wahl('ja'); };
    knoepfe.appendChild(nein);
    knoepfe.appendChild(ja);

    banner.appendChild(p);
    banner.appendChild(knoepfe);
    document.body.appendChild(banner);
    return banner;
  }
  function zeigen() { bannerBauen().hidden = false; }
  function verbergen() { if (banner) banner.hidden = true; }

  function wahl(w) {
    var vorher = stand();
    speichern(w);
    verbergen();
    if (w === 'ja') gaLaden();
    else if (vorher === 'ja' || gaGeladen) gaAbschalten();
  }

  /* ---- Widerrufslink ---- */
  function linksVerdrahten() {
    var links = document.querySelectorAll('[data-cookie-einstellungen]');
    if (!links.length) {
      var fuss = document.createElement('p');
      fuss.className = 'mm-cookie-fuss';
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-cookie-einstellungen', '');
      fuss.appendChild(a);
      document.body.appendChild(fuss);
      links = [a];
    }
    Array.prototype.forEach.call(links, function (el) {
      el.textContent = T.einstellungen;
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex') && el.tagName !== 'A' && el.tagName !== 'BUTTON') el.setAttribute('tabindex', '0');
      el.addEventListener('click', function (e) { e.preventDefault(); zeigen(); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zeigen(); }
      });
    });
  }

  function start() {
    // Style frueh einhaengen, damit auch ein spaeter geoeffnetes Banner passt.
    bannerBauen();
    linksVerdrahten();
    var s = stand();
    if (s === 'ja') gaLaden();
    else if (s !== 'nein') zeigen();
  }

  window.MMConsent = { zeigen: zeigen, stand: stand };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
