/* Sprachhinweis auf den SEO-Seiten (/<locale>/...): bietet die Fassung in der
   Sprache des Browsers an, wenn die Seite in einer anderen Sprache steht.
   Kein Redirect, kein Cookie, keine IP -- nur navigator.languages und ein
   Eintrag im localStorage (mt.sprachhinweis: 'aus' oder die gewaehlte Locale).
   Nur Sprache, nicht Region: en-GB-Besucher auf /en-us/ sehen nichts.
   "Zur Fassung" setzt wie die App mt.sprache/mt.region. */
(function () {
  'use strict';
  var KEY = 'mt.sprachhinweis';
  var STANDARD = { de: 'de-de', en: 'en-gb', fr: 'fr-fr', es: 'es-es', it: 'it-it', nl: 'nl-nl', pt: 'pt-pt' };
  var LOCALES = ['de-de', 'en-gb', 'es-es', 'fr-fr', 'it-it', 'nl-nl', 'pt-pt', 'de-at', 'de-ch', 'fr-ch', 'en-ca', 'fr-ca', 'en-us'];
  var TEXTE = {
    de: { text: 'Diese Seite gibt es auch auf Deutsch.', los: 'Auf Deutsch ansehen', zu: 'Schließen' },
    en: { text: 'This page is also available in English.', los: 'View in English', zu: 'Close' },
    fr: { text: 'Cette page existe aussi en français.', los: 'Voir en français', zu: 'Fermer' },
    es: { text: 'Esta página también está disponible en español.', los: 'Ver en español', zu: 'Cerrar' },
    it: { text: 'Questa pagina è disponibile anche in italiano.', los: 'Vai alla versione italiana', zu: 'Chiudi' },
    nl: { text: 'Deze pagina is ook beschikbaar in het Nederlands.', los: 'Bekijk in het Nederlands', zu: 'Sluiten' },
    pt: { text: 'Esta página também está disponível em português.', los: 'Ver em português', zu: 'Fechar' },
  };

  function lesen() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function schreiben(k, w) { try { localStorage.setItem(k, w); } catch (e) {} }

  // Erste Browsersprache, die wir kennen: genaue Locale, sonst Standard der Sprache.
  function beste() {
    var liste = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < liste.length; i++) {
      var l = String(liste[i]).toLowerCase();
      if (LOCALES.indexOf(l) !== -1) return l;
      if (STANDARD[l.slice(0, 2)]) return STANDARD[l.slice(0, 2)];
    }
    return null;
  }

  function zeigen() {
    var aktuell = (location.pathname.split('/')[1] || '').toLowerCase();
    if (LOCALES.indexOf(aktuell) === -1 || lesen()) return;
    var ziel = beste();
    if (!ziel || ziel.slice(0, 2) === aktuell.slice(0, 2)) return;
    var link = document.querySelector('.footer-laender a[data-locale="' + ziel + '"]');
    if (!link) return;
    var T = TEXTE[ziel.slice(0, 2)];

    var box = document.createElement('div');
    box.setAttribute('role', 'region');
    box.lang = ziel.slice(0, 2);
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;gap:12px;align-items:center;' +
      'justify-content:center;flex-wrap:wrap;padding:10px 44px 10px 16px;background:#1f2937;color:#fff;' +
      'font:14px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    var text = document.createElement('span');
    text.textContent = T.text;
    var los = document.createElement('a');
    los.href = link.getAttribute('href');
    los.textContent = T.los;
    los.style.cssText = 'color:#111;background:#fff;padding:5px 12px;border-radius:6px;text-decoration:none;font-weight:600';
    los.addEventListener('click', function () {
      schreiben(KEY, ziel);
      schreiben('mt.sprache', ziel.slice(0, 2));
      schreiben('mt.region', ziel.slice(3).toUpperCase());
    });
    var zu = document.createElement('button');
    zu.type = 'button';
    zu.setAttribute('aria-label', T.zu);
    zu.textContent = '×';
    zu.style.cssText = 'position:absolute;right:8px;top:6px;border:0;background:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px';
    zu.addEventListener('click', function () { schreiben(KEY, 'aus'); box.remove(); });
    box.appendChild(text); box.appendChild(los); box.appendChild(zu);
    document.body.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zeigen);
  else zeigen();
})();
