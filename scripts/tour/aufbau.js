/* Stellt je Tour-Seite die gewuenschte Ansicht her und zeichnet die Markierung.
   Wird nur ueber /_shot.html eingebunden (siehe _shotserver.mjs) -- die echte
   index.html bleibt unberuehrt. */
(function () {
  var seite = Number(new URLSearchParams(location.search).get('slide') || 1);

  function warte(pruefung, dann, versuche) {
    versuche = versuche || 0;
    if (pruefung()) { dann(); return; }
    if (versuche > 300) { markiereFertig('zeitueberschreitung'); return; }
    setTimeout(function () { warte(pruefung, dann, versuche + 1); }, 100);
  }
  function markiereFertig(was) {
    document.documentElement.setAttribute('data-shot', was || 'ok');
  }

  /* Markierung: Ellipse um die uebergebenen Elemente, optional ein Pfeil.
     Als Ebene ueber der Seite, damit nichts am Layout verrutscht. */
  /* Die Markierung wird bis zur Aufnahme immer wieder neu gezeichnet. Einmal
     zu messen reichte nicht: Popups ruecken nach dem Einblenden noch, Bilder
     laden nach und verschieben Zeilen -- die Ellipse sass dann daneben. */
  function dauerMarkierung(zeichne) {
    setInterval(function () {
      var alt = document.getElementById('shotEbene');
      if (alt) alt.remove();
      zeichne();
    }, 250);
    zeichne();
  }
  function ebene() {
    var alt = document.getElementById('shotEbene');
    if (alt) return alt;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'shotEbene';
    svg.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;z-index:99999;pointer-events:none');
    document.body.appendChild(svg);
    return svg;
  }
  /* Umrandung DIREKT am Element statt einer Ellipse nach Koordinaten: Im
     Headless-Modus sass die berechnete Ellipse reproduzierbar daneben (in der
     normalen Anzeige nicht), weil die Aufnahme nach dem letzten Zeichnen noch
     umbrach. Ein outline kann gar nicht verrutschen -- es gehoert zum Element,
     und der Browser zeichnet es mit dessen Rundung. */
  function kreis(el, luft) {
    if (!el) return;
    el.style.outline = '3px solid #e6b34c';
    el.style.outlineOffset = (luft == null ? 5 : luft) + 'px';
  }
  /* Pfeil unter dem Element, im Layout verankert (absolut im Elternteil) --
     aus demselben Grund wie oben. */
  function pfeil(el) {
    if (!el) return;
    var eltern = el.parentElement;
    if (!eltern) return;
    if (getComputedStyle(eltern).position === 'static') eltern.style.position = 'relative';
    if (eltern.querySelector('.shotPfeil')) return;
    var d = document.createElement('div');
    d.className = 'shotPfeil';
    // Oberhalb und nach unten zeigend: Unter dem Suchfeld liegen die
    // Vorschlaege, dort waere der Pfeil im Weg.
    d.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 6px);' +
      'width:26px;height:60px;pointer-events:none;z-index:9999';
    d.innerHTML = '<svg viewBox="0 0 26 60" width="26" height="60" fill="none" stroke="#e6b34c" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 2 L13 50"/><path d="M5 40 L13 52 L21 40"/></svg>';
    eltern.appendChild(d);
  }

  // Beim ersten Besuch oeffnet sich der Einstieg von selbst -- fuer die
  // Aufnahmen ist er im Weg (Chrome startet jedes Mal mit leerem Profil).
  function tourZu() { try { closeTour(); } catch (e) {} }
  /* Logo und die beiden Kopfzeilen ausblenden: Fuer die Bilder faengt der
     interessante Teil bei den Knoepfen Filme/Serien/Kino an. Ohne das waren die
     Bilder so hoch, dass das Einstiegsfenster darum herum ueber den Bildschirm
     hinauswuchs. */
  function kopfKuerzen() {
    var h1 = document.querySelector('header h1');
    if (h1) h1.style.display = 'none';
    document.querySelectorAll('header .sub').forEach(function (e) { e.style.display = 'none'; });
  }
  function zeilen() { return document.querySelectorAll('#list li'); }
  function katalogDa() { return typeof POOL !== 'undefined' && POOL.length > 100; }

  /* Ohne Anmeldung ist das Geschmacksprofil leer und jedes Taste-Score-Schildchen
     zeigt 0 -- fuer die Bilder unbrauchbar. Deshalb ein paar Titel als gesehen
     und bewertet unterschieben, damit echte, gestreute Werte entstehen. */
  function profilVortaeuschen() {
    CURRENT_USER = { id: 1, displayName: 'Du' };
    PROGRESS = new Map();
    var genommen = 0;
    for (var i = 0; i < POOL.length && genommen < 40; i++) {
      var p = POOL[i];
      if (p.type !== 'movie' || p.realId == null || !(p.g || []).length) continue;
      // Schwerpunkt setzen, damit das Profil eine erkennbare Vorliebe hat
      if (!/Drama|Action|Thriller|Krimi/.test((p.g || []).join(' '))) continue;
      PROGRESS.set(p.realId, { seen: true, watchlist: false, rating: 7 + (genommen % 4) });
      genommen++;
    }
    rebuild();
  }

  var AUFBAU = {
    // 1) Vom Logo bis zu den ersten Titeln, Kreis um "Neue entdecken"
    1: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        activeTab = 'filme'; watchlistFilterOn = false; seenFilterOn = false; discoverFilterOn = true;
        einstiegOffen = false; updateFilterRowUI(); renderCurrentTab();
        setTimeout(function () {
          dauerMarkierung(function () { kreis(document.getElementById('fDiscover'), 6); });
          fertig();
        }, 900);
      });
    },
    // 2) Taste-Score: Schildchen an mehreren Titeln
    2: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        activeTab = 'filme'; watchlistFilterOn = false; seenFilterOn = false; discoverFilterOn = true;
        einstiegOffen = false; updateFilterRowUI(); renderCurrentTab();
        setTimeout(function () {
          dauerMarkierung(function () {
            var s = document.querySelectorAll('#list .score');
            kreis(s[0], 5); kreis(s[1], 5);
          });
          fertig();
        }, 900);
      });
    },
    // 3) Personenliste mit zwei Kontakten, Kreis um "Match"
    3: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        CURRENT_USER = { id: 1, displayName: 'Du' };
        LINKED_LADEN = false;
        LINKED_PROFILES = [{ id: 2, name: 'Anna' }, { id: 3, name: 'Bernd' }];
        LINKED_PROGRESS = { 2: new Map(), 3: new Map() };
        MATCH_WITH = [2]; ANSICHT_PERSON = null;
        renderCurrentTab();
        renderProfileList(); renderFskRow();
        // Nur die Anleitung im Popup ausblenden -- ueber die Body-Klasse waeren
        // auch die Knoepfe in den Zeilen dahinter geschrumpft.
        var an = document.querySelector('.prov-steps'), sep = document.querySelector('.prov-sep');
        if (an) an.style.display = 'none';
        if (sep) sep.style.display = 'none';
        document.getElementById('profileModal').style.display = 'flex';
        // Spaeter messen: Das Popup rueckt nach dem Einblenden noch, und eine
        // zu frueh gezeichnete Ellipse sass daneben.
        setTimeout(function () {
          dauerMarkierung(function () {
            var z = document.querySelectorAll('.profile-item')[0];
            if (z) kreis(z.querySelector('.pi-btn[data-tun=m]'), 6);
          });
          fertig();
        }, 800);
      });
    },
    // 4) Filterzeile: Streaming-Anbieter und ein Taste-Score
    4: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        activeTab = 'filme'; watchlistFilterOn = false; seenFilterOn = false; discoverFilterOn = true;
        einstiegOffen = false; updateFilterRowUI(); renderCurrentTab();
        setTimeout(function () {
          dauerMarkierung(function () {
            kreis(document.getElementById('fInStream'), 5);
            kreis(document.querySelectorAll('#list .score')[0], 5);
          });
          fertig();
        }, 900);
      });
    },
    // 5) Aufgeklappter Titel, Kreis um Trailer und "Ähnliche Titel"
    5: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        activeTab = 'filme'; watchlistFilterOn = false; seenFilterOn = false; discoverFilterOn = true;
        einstiegOffen = false; updateFilterRowUI(); renderCurrentTab();
        setTimeout(function () {
          var li = zeilen()[0];
          li.classList.add('show-details');
          // Gar nicht scrollen: Sowohl scrollIntoView als auch ein fester Wert
          // liessen oben eine leere Flaeche stehen. Das Fenster ist stattdessen
          // hoch genug, dass Kopf und aufgeklappte Zeile zusammen hineinpassen.
          setTimeout(function () {
            dauerMarkierung(function () {
              kreis(li.querySelector('.trailer-btn'), 5);
              kreis(li.querySelector('.similar-btn'), 5);
            });
            fertig();
          }, 500);
        }, 900);
      });
    },
    // 6) Suche mit Begriff, Pfeil auf das Suchfeld
    6: function (fertig) {
      warte(katalogDa, function () {
        tourZu();
        kopfKuerzen();
        profilVortaeuschen();
        activeTab = 'filme'; einstiegOffen = false;
        searchEl.value = 'Action';
        searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(function () {
          dauerMarkierung(function () {
            pfeil(searchEl);
            // Nur drei Vorschlaege zeigen -- die volle Liste verdeckt die Titel
            // dahinter, um die es auf dieser Seite auch geht.
            var vs = document.querySelectorAll('#searchSuggest button');
            for (var i = 3; i < vs.length; i++) vs[i].style.display = 'none';
            // Nur Zeilen zeigen, in denen "Action" auch WIRKLICH steht. Die
            // Metazeile fuehrt nur das erste Genre; gesucht wird aber ueber alle.
            // Ohne diese Auswahl standen unter der Suche nach "Action" Titel mit
            // "Thriller" und "Abenteuer" in der Zeile -- richtig, aber als Bild
            // fuer die Suche nicht zu gebrauchen.
            var sichtbar = 0;
            document.querySelectorAll('#list li').forEach(function (li) {
              var zeile = li.querySelector('.meta-main') || li.querySelector('.dmeta');
              var passt = zeile && zeile.textContent.indexOf('Action') !== -1;
              if (passt && sichtbar < 3) { li.style.display = ''; sichtbar++; }
              else li.style.display = 'none';
            });
          });
          fertig();
        }, 1200);
      });
    },
  };

  window.addEventListener('load', function () {
    var bau = AUFBAU[seite];
    if (!bau) { markiereFertig('unbekannt'); return; }
    bau(function () { markiereFertig('ok'); });
  });
})();
