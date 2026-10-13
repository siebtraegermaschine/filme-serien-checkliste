// Vorlagentexte (Ueberschriften, Meta, Hinweise) der Listen-, Hub-, Wochen- und
// Reihenseiten je Sprache. Redaktionstexte kommen aus seo_content; hier steht nur,
// was der Renderer selbst schreibt. Deutsch ist die Referenz und liefert exakt die
// bisherigen Strings (de-de darf sich nicht aendern); fehlt ein Schluessel,
// greift Englisch. Argumente fuer HTML-Kontexte reicht der Renderer bereits
// escaped herein, die Funktionen escapen nichts.
import { sprachVon } from './seoLocale.js';
import { datumDeutsch, fensterWort, streamingEinleitung as streamingEinleitungDe, kinoEinleitung as kinoEinleitungDe } from './seoWochen.js';

const lc = (s) => String(s).toLocaleLowerCase();
const eins = (n, einzahl, mehrzahl) => (n === 1 ? `1 ${einzahl}` : `${n} ${mehrzahl}`);

const DE = {
  genreH1: (g, w) => `Beste ${g}-${w}`,
  genreBeschr: (g) => `Die besten ${g}-Titel im Überblick, sortiert nach Bewertung.`,
  genreListeLink: (g, w) => `Beste ${g}-${w} — die Bestenliste`,
  anbieterH1: (n) => `Filme & Serien auf ${n}`,
  anbieterBeschr: (n) => `Aktuelle Filme und Serien auf ${n} im Überblick.`,
  besteFilmeAuf: (n) => `Beste Filme auf ${n}`,
  besteSerienAuf: (n) => `Beste Serien auf ${n}`,
  neuAuf: (n) => `Neu auf ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Weitere' : 'Neue'} Titel ohne eigene Seite:`,
  aktuell: 'Aktuell', nachAnbieter: 'Nach Streaming-Anbieter', nachJahrzehnt: 'Nach Jahrzehnt', nachThema: 'Nach Thema',
  nachLand: 'Nach Land', nachSprache: 'Nach Originalsprache', nachStaffeln: 'Nach Staffelzahl', nachLaufzeit: 'Nach Laufzeit',
  nachJahr: 'Nach Jahr', nachGenre: 'Nach Genre', verwNachAnbieter: 'Nach Anbieter',
  imKino: (w) => `${w} im Kino`, neueTitel: (w) => `Neue ${w}`,
  listeBeschr: (u) => `${u} im Überblick, sortiert nach Bewertung.`,
  alleGenre: (g, w) => `Alle ${g}-${w}`, alleAuf: (n) => `Alle Titel auf ${n}`,
  kinoStadtTitel: (o) => `Kino in ${o}: Aktuelle Filme`,
  kinoStadtBeschr: (o) => `Aktuelle Kinostarts und Kinos in ${o} im Überblick.`,
  neustartsLink: 'Neu im Kino: Neustarts dieser und der nächsten Woche',
  aktuellKino: 'Aktuell im Kino', kinosIn: (o) => `Kinos in ${o}`,
  keineSpielzeiten: 'Spielzeiten sind noch nicht verfuegbar.', website: 'Website',
  entdeckenTitel: (w) => `${w} entdecken — Bewertung, Streaming & mehr`,
  entdeckenH1: (w) => `${w} entdecken`,
  entdeckenBeschr: (w) => `${w} nach Genre, Bewertung und Verfügbarkeit entdecken.`,
  genres: 'Genres', beliebte: (w) => `Beliebte ${w}`,
  kinoHubTitel: 'Kino: Aktuelle Filme & Kinos in deiner Stadt',
  kinoHubBeschr: 'Aktuelle Kinostarts und Kinos nach Stadt im Überblick.',
  kinosNachStadt: 'Kinos nach Stadt',
  streamingHubTitel: 'Streaming-Anbieter im Überblick',
  streamingHubBeschr: 'Filme und Serien nach Streaming-Anbieter im Überblick.',
  neuStreamingLink: 'Neu im Streaming: Neuzugänge der letzten Tage nach Anbieter',
  titelAnzahl: (n) => `${n} Titel`,
  bestenTitel: 'Bestenlisten: Beste Filme & Beste Serien',
  bestenBeschr: 'Bestenlisten für Filme und Serien, nach Jahr und Genre.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Beste Filme', text: 'Die höchstbewerteten Filme nach Jahr und Genre.' },
    { pfad: 'beste-serien', name: 'Beste Serien', text: 'Die höchstbewerteten Serien nach Jahr und Genre.' },
  ],
  besteWort: (w) => `Beste ${w}`,
  besteHubTitel: (w) => `Beste ${w}: Bestenlisten nach Jahr & Genre`,
  besteHubBeschr: (w) => `Bestenlisten der ${w} nach Jahr und Genre.`,
  reiheH1: (n) => `${n} Filme in Erscheinungsreihenfolge`,
  reiheBeschr: (h, n) => `${h}: alle ${n} Filme mit Bewertung und Streaming-Hinweis.`,
  alleFilmeUeb: 'Alle Filme im Überblick',
  imAboBei: (l) => `Im Abo bei: ${l}`,
  keinAboReihe: 'Aktuell bei keinem bekannten Anbieter im Abo',
  reiheFuss: (a) => `Die Reihenfolge folgt dem Erscheinungsdatum laut TMDB. Die Handlung kann zeitlich anders verlaufen. ${a}`,
  alleReihen: 'Alle Reihen',
  reihenTitel: 'Filmreihen & Franchises in Erscheinungsreihenfolge',
  reihenBeschr: 'Filmreihen und Franchises mit allen Filmen in Erscheinungsreihenfolge, mit Bewertung und Streaming-Hinweis.',
  reihenH1: 'Filmreihen & Franchises', beliebteReihen: 'Beliebte Reihen', alleReihenAZ: 'Alle Reihen von A bis Z',
  anzahlFilme: (n) => `${n} Filme`,
  neuStreaming: 'Neu im Streaming', neustarts: 'Neustarts', neuImKino: 'Neu im Kino',
  neuUebTitel: 'Neu im Streaming: Neuzugänge bei Netflix, Prime Video & Co.',
  neuUebBeschr: (s) => `Neue Filme und Serien nach Streaming-Anbieter in Deutschland, Stand ${s}.`,
  neuUebEinleitung: (s) => `Stand ${s}: Was bei den Streaming-Anbietern in Deutschland neu dazugekommen ist. Als neu gilt ein Titel, den MovieMatch bei einem Anbieter zum ersten Mal sieht.`,
  neuZeile: (n, tage) => `${n} neue${n === 1 ? 'r Titel' : ' Titel'} in ${fensterWort(tage)}`,
  alleAnbieter: 'Alle Streaming-Anbieter',
  zeitraumStreaming: (tage) => (tage === 7 ? 'der letzten 7 Tage' : `der letzten ${tage} Tage`),
  neuAnbTitel: (n, z) => `Neu auf ${n}: Filme & Serien ${z}`,
  chipFilme: (n) => `Filme (${n})`, chipSerien: (n) => `Serien (${n})`,
  neueFilme: 'Neue Filme', neueSerien: 'Neue Serien',
  alleTitelAuf: (n) => `Alle Filme & Serien auf ${n}`,
  neuBeiAllen: 'Neu bei allen Anbietern', neuBeiAnderen: 'Neu bei anderen Anbietern',
  zeitraumKino: (tage) => (tage === 7 ? 'diese Woche' : `der letzten ${tage} Tage`),
  kinoNeuTitel: (z) => `Neu im Kino: Kinostarts ${z} und nächste Woche`,
  gestartetH2: (tage) => (tage === 7 ? 'Diese Woche gestartet' : `Gestartet in den letzten ${tage} Tagen`),
  keineNeustarts: 'Aktuell keine Neustarts erkannt.', naechsteWoche: 'Nächste Woche',
  kinoUebersicht: 'Kino-Übersicht', besteImKino: 'Beste Filme im Kino',
  streamingEinleitung: (o) => streamingEinleitungDe(o),
  kinoEinleitung: (o) => kinoEinleitungDe(o),
};

const EN = {
  genreH1: (g, w) => `Best ${g} ${w}`,
  genreBeschr: (g) => `The best ${g} titles at a glance, sorted by rating.`,
  genreListeLink: (g, w) => `Best ${g} ${w} — the top list`,
  anbieterH1: (n) => `Movies & TV series on ${n}`,
  anbieterBeschr: (n) => `Current movies and TV series on ${n} at a glance.`,
  besteFilmeAuf: (n) => `Best movies on ${n}`,
  besteSerienAuf: (n) => `Best TV series on ${n}`,
  neuAuf: (n) => `New on ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'More' : 'New'} titles without a page of their own:`,
  aktuell: 'Current', nachAnbieter: 'By streaming provider', nachJahrzehnt: 'By decade', nachThema: 'By theme',
  nachLand: 'By country', nachSprache: 'By original language', nachStaffeln: 'By number of seasons', nachLaufzeit: 'By runtime',
  nachJahr: 'By year', nachGenre: 'By genre', verwNachAnbieter: 'By provider',
  imKino: (w) => `${w} in cinemas`, neueTitel: (w) => `New ${w}`,
  listeBeschr: (u) => `${u} at a glance, sorted by rating.`,
  alleGenre: (g, w) => `All ${g} ${w}`, alleAuf: (n) => `All titles on ${n}`,
  kinoStadtTitel: (o) => `Cinema in ${o}: current movies`,
  kinoStadtBeschr: (o) => `Current cinema releases and cinemas in ${o} at a glance.`,
  neustartsLink: 'New in cinemas: releases this week and next',
  aktuellKino: 'Now in cinemas', kinosIn: (o) => `Cinemas in ${o}`,
  keineSpielzeiten: 'Showtimes are not available yet.', website: 'Website',
  entdeckenTitel: (w) => `Discover ${w} — rating, streaming & more`,
  entdeckenH1: (w) => `Discover ${w}`,
  entdeckenBeschr: (w) => `Discover ${w} by genre, rating and availability.`,
  genres: 'Genres', beliebte: (w) => `Popular ${w}`,
  kinoHubTitel: 'Cinema: current movies & cinemas in your city',
  kinoHubBeschr: 'Current cinema releases and cinemas by city at a glance.',
  kinosNachStadt: 'Cinemas by city',
  streamingHubTitel: 'Streaming providers at a glance',
  streamingHubBeschr: 'Movies and TV series by streaming provider at a glance.',
  neuStreamingLink: 'New on streaming: recent additions by provider',
  titelAnzahl: (n) => `${n} titles`,
  bestenTitel: 'Top lists: best movies & best TV series',
  bestenBeschr: 'Top lists for movies and TV series, by year and genre.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Best movies', text: 'The highest-rated movies by year and genre.' },
    { pfad: 'beste-serien', name: 'Best TV series', text: 'The highest-rated TV series by year and genre.' },
  ],
  besteWort: (w) => `Best ${w}`,
  besteHubTitel: (w) => `Best ${w}: top lists by year & genre`,
  besteHubBeschr: (w) => `Top lists of ${w} by year and genre.`,
  reiheH1: (n) => `${n} movies in release order`,
  reiheBeschr: (h, n) => `${h}: all ${n} movies with rating and streaming info.`,
  alleFilmeUeb: 'All movies at a glance',
  imAboBei: (l) => `Included with a subscription on: ${l}`,
  keinAboReihe: 'Currently not included in any known subscription',
  reiheFuss: (a) => `The order follows the release date according to TMDB. The story may run in a different order. ${a}`,
  alleReihen: 'All franchises',
  reihenTitel: 'Movie franchises in release order',
  reihenBeschr: 'Movie franchises with all films in release order, with rating and streaming info.',
  reihenH1: 'Movie franchises', beliebteReihen: 'Popular franchises', alleReihenAZ: 'All franchises from A to Z',
  anzahlFilme: (n) => `${n} movies`,
  neuStreaming: 'New on streaming', neustarts: 'New releases', neuImKino: 'New in cinemas',
  neuUebTitel: 'New on streaming: additions on Netflix, Prime Video & co.',
  neuUebBeschr: (s, r) => `New movies and TV series by streaming provider (${r}), as of ${s}.`,
  neuUebEinleitung: (s, r) => `As of ${s}: what has recently been added at the streaming providers (${r}). A title counts as new when MovieMatch sees it at a provider for the first time.`,
  neuZeile: (n, tage) => `${n} new ${n === 1 ? 'title' : 'titles'} in the last ${tage} days`,
  alleAnbieter: 'All streaming providers',
  zeitraumStreaming: (tage) => `the last ${tage} days`,
  neuAnbTitel: (n, z) => `New on ${n}: movies & TV series from ${z}`,
  chipFilme: (n) => `Movies (${n})`, chipSerien: (n) => `TV series (${n})`,
  neueFilme: 'New movies', neueSerien: 'New TV series',
  alleTitelAuf: (n) => `All movies & TV series on ${n}`,
  neuBeiAllen: 'New on all providers', neuBeiAnderen: 'New on other providers',
  zeitraumKino: (tage) => (tage === 7 ? 'this week' : `the last ${tage} days`),
  kinoNeuTitel: (z) => `New in cinemas: releases ${z} and next week`,
  gestartetH2: (tage) => (tage === 7 ? 'Released this week' : `Released in the last ${tage} days`),
  keineNeustarts: 'No new releases detected at the moment.', naechsteWoche: 'Next week',
  kinoUebersicht: 'Cinema overview', besteImKino: 'Best movies in cinemas',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `As of ${s}: in the last ${tage} days, MovieMatch has not detected any new titles on ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'movie', 'movies'));
    if (serien) teile.push(eins(serien, 'TV series', 'TV series'));
    return `As of ${s}: new on ${name} in the last ${tage} days: ${teile.join(' and ')}. A title counts as new when MovieMatch sees it at this provider (${region}) for the first time; the list is sorted by rating.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `As of ${s}: cinema releases (${region}) in the last ${tage} days: ${eins(gestartet, 'movie', 'movies')}`
    + (naechste ? `; in the next 7 days: ${eins(naechste, 'more release', 'more releases')}` : '')
    + '. Based on release dates, including re-releases.',
};

const ES = {
  genreH1: (g, w) => `Mejores ${lc(w)} de ${lc(g)}`,
  genreBeschr: (g) => `Los mejores títulos de ${lc(g)} de un vistazo, ordenados por valoración.`,
  genreListeLink: (g, w) => `Mejores ${lc(w)} de ${lc(g)}: la lista`,
  anbieterH1: (n) => `Películas y series en ${n}`,
  anbieterBeschr: (n) => `Películas y series actuales en ${n} de un vistazo.`,
  besteFilmeAuf: (n) => `Mejores películas en ${n}`,
  besteSerienAuf: (n) => `Mejores series en ${n}`,
  neuAuf: (n) => `Novedades en ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Más títulos' : 'Títulos nuevos'} sin página propia:`,
  aktuell: 'Actualidad', nachAnbieter: 'Por plataforma de streaming', nachJahrzehnt: 'Por década', nachThema: 'Por temática',
  nachLand: 'Por país', nachSprache: 'Por idioma original', nachStaffeln: 'Por número de temporadas', nachLaufzeit: 'Por duración',
  nachJahr: 'Por año', nachGenre: 'Por género', verwNachAnbieter: 'Por plataforma',
  imKino: (w) => `${w} en el cine`, neueTitel: (w) => `${w} nuevas`,
  listeBeschr: (u) => `${u} de un vistazo, ordenadas por valoración.`,
  alleGenre: (g, w) => `Todas las ${lc(w)} de ${lc(g)}`, alleAuf: (n) => `Todos los títulos en ${n}`,
  kinoStadtTitel: (o) => `Cine en ${o}: películas en cartelera`,
  kinoStadtBeschr: (o) => `Estrenos y cines en ${o} de un vistazo.`,
  neustartsLink: 'Novedades en el cine: estrenos de esta semana y la próxima',
  aktuellKino: 'En cartelera', kinosIn: (o) => `Cines en ${o}`,
  keineSpielzeiten: 'Los horarios aún no están disponibles.', website: 'Sitio web',
  entdeckenTitel: (w) => `Descubre ${lc(w)}: valoración, streaming y más`,
  entdeckenH1: (w) => `Descubre ${lc(w)}`,
  entdeckenBeschr: (w) => `Descubre ${lc(w)} por género, valoración y disponibilidad.`,
  genres: 'Géneros', beliebte: (w) => `${w} populares`,
  kinoHubTitel: 'Cine: películas en cartelera y cines de tu ciudad',
  kinoHubBeschr: 'Estrenos de cine y cines por ciudad de un vistazo.',
  kinosNachStadt: 'Cines por ciudad',
  streamingHubTitel: 'Plataformas de streaming de un vistazo',
  streamingHubBeschr: 'Películas y series por plataforma de streaming de un vistazo.',
  neuStreamingLink: 'Novedades en streaming: altas recientes por plataforma',
  titelAnzahl: (n) => `${n} títulos`,
  bestenTitel: 'Mejores listas: mejores películas y mejores series',
  bestenBeschr: 'Listas de las mejores películas y series, por año y género.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Mejores películas', text: 'Las películas mejor valoradas por año y género.' },
    { pfad: 'beste-serien', name: 'Mejores series', text: 'Las series mejor valoradas por año y género.' },
  ],
  besteWort: (w) => `Mejores ${lc(w)}`,
  besteHubTitel: (w) => `Mejores ${lc(w)}: listas por año y género`,
  besteHubBeschr: (w) => `Listas de las mejores ${lc(w)} por año y género.`,
  reiheH1: (n) => `${n}: películas en orden de estreno`,
  reiheBeschr: (h, n) => `${h}: las ${n} películas con valoración e información de streaming.`,
  alleFilmeUeb: 'Todas las películas de un vistazo',
  imAboBei: (l) => `Incluida en la suscripción de: ${l}`,
  keinAboReihe: 'Ahora mismo no está incluida en ninguna suscripción conocida',
  reiheFuss: (a) => `El orden sigue la fecha de estreno según TMDB. La trama puede seguir otro orden cronológico. ${a}`,
  alleReihen: 'Todas las sagas',
  reihenTitel: 'Sagas de películas en orden de estreno',
  reihenBeschr: 'Sagas y franquicias con todas sus películas en orden de estreno, con valoración e información de streaming.',
  reihenH1: 'Sagas y franquicias', beliebteReihen: 'Sagas populares', alleReihenAZ: 'Todas las sagas de la A a la Z',
  anzahlFilme: (n) => `${n} películas`,
  neuStreaming: 'Novedades en streaming', neustarts: 'Estrenos', neuImKino: 'Novedades en el cine',
  neuUebTitel: 'Novedades en streaming: altas en Netflix, Prime Video y más',
  neuUebBeschr: (s, r) => `Películas y series nuevas por plataforma de streaming (${r}), a fecha de ${s}.`,
  neuUebEinleitung: (s, r) => `A fecha de ${s}: lo que se ha añadido recientemente en las plataformas de streaming (${r}). Se considera nuevo un título que MovieMatch ve por primera vez en una plataforma.`,
  neuZeile: (n, tage) => `${n} ${n === 1 ? 'título nuevo' : 'títulos nuevos'} en los últimos ${tage} días`,
  alleAnbieter: 'Todas las plataformas de streaming',
  zeitraumStreaming: (tage) => `los últimos ${tage} días`,
  neuAnbTitel: (n, z) => `Novedades en ${n}: películas y series de ${z}`,
  chipFilme: (n) => `Películas (${n})`, chipSerien: (n) => `Series (${n})`,
  neueFilme: 'Películas nuevas', neueSerien: 'Series nuevas',
  alleTitelAuf: (n) => `Todas las películas y series en ${n}`,
  neuBeiAllen: 'Novedades en todas las plataformas', neuBeiAnderen: 'Novedades en otras plataformas',
  zeitraumKino: (tage) => (tage === 7 ? 'esta semana' : `los últimos ${tage} días`),
  kinoNeuTitel: (z) => `Novedades en el cine: estrenos de ${z} y la próxima semana`,
  gestartetH2: (tage) => (tage === 7 ? 'Estrenadas esta semana' : `Estrenadas en los últimos ${tage} días`),
  keineNeustarts: 'Ahora mismo no se detectan estrenos.', naechsteWoche: 'Próxima semana',
  kinoUebersicht: 'Resumen del cine', besteImKino: 'Mejores películas en el cine',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `A fecha de ${s}: en los últimos ${tage} días, MovieMatch no ha detectado títulos nuevos en ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'película', 'películas'));
    if (serien) teile.push(eins(serien, 'serie', 'series'));
    return `A fecha de ${s}: novedades en ${name} en los últimos ${tage} días: ${teile.join(' y ')}. Se considera nuevo un título que MovieMatch ve por primera vez en esta plataforma (${region}); la lista está ordenada por valoración.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `A fecha de ${s}: estrenos en cines (${region}) en los últimos ${tage} días: ${eins(gestartet, 'película', 'películas')}`
    + (naechste ? `; en los próximos 7 días: ${eins(naechste, 'estreno más', 'estrenos más')}` : '')
    + '. Según las fechas de estreno, reposiciones incluidas.',
};

const FR = {
  genreH1: (g, w) => `Meilleur${w === 'Séries' ? 'es' : 's'} ${lc(w)} : ${g}`,
  genreBeschr: (g) => `Les meilleurs titres du genre ${lc(g)} en un coup d’œil, classés par note.`,
  genreListeLink: (g, w) => `Meilleur${w === 'Séries' ? 'es' : 's'} ${lc(w)} : ${g}, le classement`,
  anbieterH1: (n) => `Films et séries sur ${n}`,
  anbieterBeschr: (n) => `Films et séries actuellement sur ${n} en un coup d’œil.`,
  besteFilmeAuf: (n) => `Meilleurs films sur ${n}`,
  besteSerienAuf: (n) => `Meilleures séries sur ${n}`,
  neuAuf: (n) => `Nouveautés sur ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Autres titres' : 'Nouveaux titres'} sans page dédiée :`,
  aktuell: 'À l’affiche', nachAnbieter: 'Par plateforme de streaming', nachJahrzehnt: 'Par décennie', nachThema: 'Par thème',
  nachLand: 'Par pays', nachSprache: 'Par langue originale', nachStaffeln: 'Par nombre de saisons', nachLaufzeit: 'Par durée',
  nachJahr: 'Par année', nachGenre: 'Par genre', verwNachAnbieter: 'Par plateforme',
  imKino: (w) => `${w} au cinéma`, neueTitel: (w) => `${w === 'Séries' ? 'Nouvelles' : 'Nouveaux'} ${lc(w)}`,
  listeBeschr: (u) => `${u} en un coup d’œil, classés par note.`,
  alleGenre: (g, w) => `Tous les titres ${lc(w)} : ${g}`, alleAuf: (n) => `Tous les titres sur ${n}`,
  kinoStadtTitel: (o) => `Cinéma à ${o} : films à l’affiche`,
  kinoStadtBeschr: (o) => `Sorties et cinémas à ${o} en un coup d’œil.`,
  neustartsLink: 'Nouveautés au cinéma : sorties de cette semaine et de la suivante',
  aktuellKino: 'À l’affiche', kinosIn: (o) => `Cinémas à ${o}`,
  keineSpielzeiten: 'Les horaires ne sont pas encore disponibles.', website: 'Site web',
  entdeckenTitel: (w) => `Découvrir les ${lc(w)} : note, streaming et plus`,
  entdeckenH1: (w) => `Découvrir les ${lc(w)}`,
  entdeckenBeschr: (w) => `Découvrez les ${lc(w)} par genre, note et disponibilité.`,
  genres: 'Genres', beliebte: (w) => `${w} populaires`,
  kinoHubTitel: 'Cinéma : films à l’affiche et salles de votre ville',
  kinoHubBeschr: 'Sorties cinéma et salles par ville en un coup d’œil.',
  kinosNachStadt: 'Cinémas par ville',
  streamingHubTitel: 'Plateformes de streaming en un coup d’œil',
  streamingHubBeschr: 'Films et séries par plateforme de streaming en un coup d’œil.',
  neuStreamingLink: 'Nouveautés en streaming : derniers ajouts par plateforme',
  titelAnzahl: (n) => `${n} titres`,
  bestenTitel: 'Classements : meilleurs films et meilleures séries',
  bestenBeschr: 'Classements des films et séries, par année et par genre.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Meilleurs films', text: 'Les films les mieux notés, par année et par genre.' },
    { pfad: 'beste-serien', name: 'Meilleures séries', text: 'Les séries les mieux notées, par année et par genre.' },
  ],
  besteWort: (w) => `Meilleur${w === 'Séries' ? 'es' : 's'} ${lc(w)}`,
  besteHubTitel: (w) => `Meilleur${w === 'Séries' ? 'es' : 's'} ${lc(w)} : classements par année et genre`,
  besteHubBeschr: (w) => `Classements des ${lc(w)} par année et par genre.`,
  reiheH1: (n) => `${n} : films dans l’ordre de sortie`,
  reiheBeschr: (h, n) => `${h} : les ${n} films avec note et infos de streaming.`,
  alleFilmeUeb: 'Tous les films en un coup d’œil',
  imAboBei: (l) => `Inclus dans l’abonnement de : ${l}`,
  keinAboReihe: 'Actuellement inclus dans aucun abonnement connu',
  reiheFuss: (a) => `L’ordre suit la date de sortie selon TMDB. L’intrigue peut suivre une autre chronologie. ${a}`,
  alleReihen: 'Toutes les sagas',
  reihenTitel: 'Sagas de films dans l’ordre de sortie',
  reihenBeschr: 'Sagas et franchises avec tous leurs films dans l’ordre de sortie, avec note et infos de streaming.',
  reihenH1: 'Sagas et franchises', beliebteReihen: 'Sagas populaires', alleReihenAZ: 'Toutes les sagas de A à Z',
  anzahlFilme: (n) => `${n} films`,
  neuStreaming: 'Nouveautés en streaming', neustarts: 'Sorties', neuImKino: 'Nouveautés au cinéma',
  neuUebTitel: 'Nouveautés en streaming : ajouts sur Netflix, Prime Video et plus',
  neuUebBeschr: (s, r) => `Nouveaux films et séries par plateforme de streaming (${r}), au ${s}.`,
  neuUebEinleitung: (s, r) => `Au ${s} : ce qui vient d’être ajouté chez les plateformes de streaming (${r}). Un titre est considéré comme nouveau lorsque MovieMatch le voit pour la première fois chez une plateforme.`,
  neuZeile: (n, tage) => `${n} ${n === 1 ? 'nouveau titre' : 'nouveaux titres'} ces ${tage} derniers jours`,
  alleAnbieter: 'Toutes les plateformes de streaming',
  zeitraumStreaming: (tage) => `les ${tage} derniers jours`,
  neuAnbTitel: (n, z) => `Nouveautés sur ${n} : films et séries sur ${z}`,
  chipFilme: (n) => `Films (${n})`, chipSerien: (n) => `Séries (${n})`,
  neueFilme: 'Nouveaux films', neueSerien: 'Nouvelles séries',
  alleTitelAuf: (n) => `Tous les films et séries sur ${n}`,
  neuBeiAllen: 'Nouveautés sur toutes les plateformes', neuBeiAnderen: 'Nouveautés sur d’autres plateformes',
  zeitraumKino: (tage) => (tage === 7 ? 'cette semaine' : `les ${tage} derniers jours`),
  kinoNeuTitel: (z) => `Nouveautés au cinéma : sorties ${z} et la semaine prochaine`,
  gestartetH2: (tage) => (tage === 7 ? 'Sortis cette semaine' : `Sortis ces ${tage} derniers jours`),
  keineNeustarts: 'Aucune sortie détectée pour le moment.', naechsteWoche: 'Semaine prochaine',
  kinoUebersicht: 'Aperçu du cinéma', besteImKino: 'Meilleurs films au cinéma',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `Au ${s} : au cours des ${tage} derniers jours, MovieMatch n’a repéré aucun nouveau titre sur ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'film', 'films'));
    if (serien) teile.push(eins(serien, 'série', 'séries'));
    return `Au ${s} : nouveautés sur ${name} ces ${tage} derniers jours : ${teile.join(' et ')}. Un titre est considéré comme nouveau lorsque MovieMatch le voit pour la première fois chez cette plateforme (${region}) ; la liste est triée par note.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `Au ${s} : sorties en salles (${region}) ces ${tage} derniers jours : ${eins(gestartet, 'film', 'films')}`
    + (naechste ? ` ; dans les 7 prochains jours : ${eins(naechste, 'sortie de plus', 'sorties de plus')}` : '')
    + '. D’après les dates de sortie, reprises comprises.',
};

const IT = {
  genreH1: (g, w) => `${w === 'Film' ? 'I migliori film' : 'Le migliori serie TV'}: ${g}`,
  genreBeschr: (g) => `I migliori titoli del genere ${lc(g)} in breve, ordinati per voto.`,
  genreListeLink: (g, w) => `${w === 'Film' ? 'I migliori film' : 'Le migliori serie TV'}: ${g}, la classifica`,
  anbieterH1: (n) => `Film e serie TV su ${n}`,
  anbieterBeschr: (n) => `Film e serie TV attuali su ${n} in breve.`,
  besteFilmeAuf: (n) => `I migliori film su ${n}`,
  besteSerienAuf: (n) => `Le migliori serie TV su ${n}`,
  neuAuf: (n) => `Novità su ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Altri titoli' : 'Nuovi titoli'} senza pagina dedicata:`,
  aktuell: 'Attualità', nachAnbieter: 'Per piattaforma di streaming', nachJahrzehnt: 'Per decennio', nachThema: 'Per tema',
  nachLand: 'Per paese', nachSprache: 'Per lingua originale', nachStaffeln: 'Per numero di stagioni', nachLaufzeit: 'Per durata',
  nachJahr: 'Per anno', nachGenre: 'Per genere', verwNachAnbieter: 'Per piattaforma',
  imKino: (w) => `${w} al cinema`, neueTitel: (w) => `${w} nuov${w === 'Film' ? 'i' : 'e'}`,
  listeBeschr: (u) => `${u} in breve, ordinati per voto.`,
  alleGenre: (g, w) => `Tutti i titoli ${w === 'Film' ? 'film' : 'serie TV'}: ${g}`, alleAuf: (n) => `Tutti i titoli su ${n}`,
  kinoStadtTitel: (o) => `Cinema a ${o}: film in sala`,
  kinoStadtBeschr: (o) => `Uscite e cinema a ${o} in breve.`,
  neustartsLink: 'Novità al cinema: uscite di questa settimana e della prossima',
  aktuellKino: 'In sala', kinosIn: (o) => `Cinema a ${o}`,
  keineSpielzeiten: 'Gli orari non sono ancora disponibili.', website: 'Sito web',
  entdeckenTitel: (w) => `Scopri ${w === 'Film' ? 'i film' : 'le serie TV'}: voto, streaming e altro`,
  entdeckenH1: (w) => `Scopri ${w === 'Film' ? 'i film' : 'le serie TV'}`,
  entdeckenBeschr: (w) => `Scopri ${w === 'Film' ? 'i film' : 'le serie TV'} per genere, voto e disponibilità.`,
  genres: 'Generi', beliebte: (w) => `${w} più popolari`,
  kinoHubTitel: 'Cinema: film in sala e cinema della tua città',
  kinoHubBeschr: 'Uscite al cinema e cinema per città in breve.',
  kinosNachStadt: 'Cinema per città',
  streamingHubTitel: 'Piattaforme di streaming in breve',
  streamingHubBeschr: 'Film e serie TV per piattaforma di streaming in breve.',
  neuStreamingLink: 'Novità in streaming: ultimi arrivi per piattaforma',
  titelAnzahl: (n) => `${n} titoli`,
  bestenTitel: 'Classifiche: migliori film e migliori serie TV',
  bestenBeschr: 'Classifiche di film e serie TV, per anno e genere.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'I migliori film', text: 'I film con il voto più alto, per anno e genere.' },
    { pfad: 'beste-serien', name: 'Le migliori serie TV', text: 'Le serie TV con il voto più alto, per anno e genere.' },
  ],
  besteWort: (w) => (w === 'Film' ? 'I migliori film' : 'Le migliori serie TV'),
  besteHubTitel: (w) => `${w === 'Film' ? 'I migliori film' : 'Le migliori serie TV'}: classifiche per anno e genere`,
  besteHubBeschr: (w) => `Classifiche di ${w === 'Film' ? 'film' : 'serie TV'} per anno e genere.`,
  reiheH1: (n) => `${n}: film in ordine di uscita`,
  reiheBeschr: (h, n) => `${h}: tutti i ${n} film con voto e informazioni di streaming.`,
  alleFilmeUeb: 'Tutti i film in breve',
  imAboBei: (l) => `Incluso nell’abbonamento di: ${l}`,
  keinAboReihe: 'Al momento non incluso in alcun abbonamento noto',
  reiheFuss: (a) => `L’ordine segue la data di uscita secondo TMDB. La trama può seguire un’altra cronologia. ${a}`,
  alleReihen: 'Tutte le saghe',
  reihenTitel: 'Saghe cinematografiche in ordine di uscita',
  reihenBeschr: 'Saghe e franchise con tutti i film in ordine di uscita, con voto e informazioni di streaming.',
  reihenH1: 'Saghe e franchise', beliebteReihen: 'Saghe popolari', alleReihenAZ: 'Tutte le saghe dalla A alla Z',
  anzahlFilme: (n) => `${n} film`,
  neuStreaming: 'Novità in streaming', neustarts: 'Uscite', neuImKino: 'Novità al cinema',
  neuUebTitel: 'Novità in streaming: arrivi su Netflix, Prime Video e altri',
  neuUebBeschr: (s, r) => `Nuovi film e serie TV per piattaforma di streaming (${r}), al ${s}.`,
  neuUebEinleitung: (s, r) => `Al ${s}: cosa è stato aggiunto di recente sulle piattaforme di streaming (${r}). Un titolo è considerato nuovo quando MovieMatch lo vede per la prima volta su una piattaforma.`,
  neuZeile: (n, tage) => `${n} ${n === 1 ? 'nuovo titolo' : 'nuovi titoli'} negli ultimi ${tage} giorni`,
  alleAnbieter: 'Tutte le piattaforme di streaming',
  zeitraumStreaming: (tage) => `gli ultimi ${tage} giorni`,
  neuAnbTitel: (n, z) => `Novità su ${n}: film e serie TV di ${z}`,
  chipFilme: (n) => `Film (${n})`, chipSerien: (n) => `Serie TV (${n})`,
  neueFilme: 'Nuovi film', neueSerien: 'Nuove serie TV',
  alleTitelAuf: (n) => `Tutti i film e le serie TV su ${n}`,
  neuBeiAllen: 'Novità su tutte le piattaforme', neuBeiAnderen: 'Novità su altre piattaforme',
  zeitraumKino: (tage) => (tage === 7 ? 'questa settimana' : `gli ultimi ${tage} giorni`),
  kinoNeuTitel: (z) => `Novità al cinema: uscite di ${z} e della prossima settimana`,
  gestartetH2: (tage) => (tage === 7 ? 'Usciti questa settimana' : `Usciti negli ultimi ${tage} giorni`),
  keineNeustarts: 'Al momento nessuna uscita rilevata.', naechsteWoche: 'Prossima settimana',
  kinoUebersicht: 'Panoramica del cinema', besteImKino: 'I migliori film al cinema',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `Al ${s}: negli ultimi ${tage} giorni MovieMatch non ha rilevato nuovi titoli su ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'film', 'film'));
    if (serien) teile.push(eins(serien, 'serie TV', 'serie TV'));
    return `Al ${s}: novità su ${name} negli ultimi ${tage} giorni: ${teile.join(' e ')}. Un titolo è considerato nuovo quando MovieMatch lo vede per la prima volta presso questa piattaforma (${region}); l’elenco è ordinato per voto.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `Al ${s}: uscite al cinema (${region}) negli ultimi ${tage} giorni: ${eins(gestartet, 'film', 'film')}`
    + (naechste ? `; nei prossimi 7 giorni: ${eins(naechste, 'uscita in più', 'uscite in più')}` : '')
    + '. In base alle date di uscita, riedizioni incluse.',
};

const NL = {
  genreH1: (g, w) => `Beste ${lc(w)}: ${g}`,
  genreBeschr: (g) => `De beste titels in het genre ${lc(g)} in één oogopslag, gesorteerd op beoordeling.`,
  genreListeLink: (g, w) => `Beste ${lc(w)}: ${g}, de toplijst`,
  anbieterH1: (n) => `Films en series op ${n}`,
  anbieterBeschr: (n) => `Actuele films en series op ${n} in één oogopslag.`,
  besteFilmeAuf: (n) => `Beste films op ${n}`,
  besteSerienAuf: (n) => `Beste series op ${n}`,
  neuAuf: (n) => `Nieuw op ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Overige titels' : 'Nieuwe titels'} zonder eigen pagina:`,
  aktuell: 'Actueel', nachAnbieter: 'Per streamingdienst', nachJahrzehnt: 'Per decennium', nachThema: 'Per thema',
  nachLand: 'Per land', nachSprache: 'Per oorspronkelijke taal', nachStaffeln: 'Per aantal seizoenen', nachLaufzeit: 'Per speelduur',
  nachJahr: 'Per jaar', nachGenre: 'Per genre', verwNachAnbieter: 'Per aanbieder',
  imKino: (w) => `${w} in de bioscoop`, neueTitel: (w) => `Nieuwe ${lc(w)}`,
  listeBeschr: (u) => `${u} in één oogopslag, gesorteerd op beoordeling.`,
  alleGenre: (g, w) => `Alle ${lc(w)}: ${g}`, alleAuf: (n) => `Alle titels op ${n}`,
  kinoStadtTitel: (o) => `Bioscoop in ${o}: actuele films`,
  kinoStadtBeschr: (o) => `Actuele bioscoopreleases en bioscopen in ${o} in één oogopslag.`,
  neustartsLink: 'Nieuw in de bioscoop: releases van deze en volgende week',
  aktuellKino: 'Nu in de bioscoop', kinosIn: (o) => `Bioscopen in ${o}`,
  keineSpielzeiten: 'Speeltijden zijn nog niet beschikbaar.', website: 'Website',
  entdeckenTitel: (w) => `${w} ontdekken — beoordeling, streaming en meer`,
  entdeckenH1: (w) => `${w} ontdekken`,
  entdeckenBeschr: (w) => `Ontdek ${lc(w)} per genre, beoordeling en beschikbaarheid.`,
  genres: 'Genres', beliebte: (w) => `Populaire ${lc(w)}`,
  kinoHubTitel: 'Bioscoop: actuele films en bioscopen in jouw stad',
  kinoHubBeschr: 'Actuele bioscoopreleases en bioscopen per stad in één oogopslag.',
  kinosNachStadt: 'Bioscopen per stad',
  streamingHubTitel: 'Streamingdiensten in één oogopslag',
  streamingHubBeschr: 'Films en series per streamingdienst in één oogopslag.',
  neuStreamingLink: 'Nieuw op streaming: recente aanwinsten per aanbieder',
  titelAnzahl: (n) => `${n} titels`,
  bestenTitel: 'Toplijsten: beste films en beste series',
  bestenBeschr: 'Toplijsten voor films en series, per jaar en genre.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Beste films', text: 'De best beoordeelde films per jaar en genre.' },
    { pfad: 'beste-serien', name: 'Beste series', text: 'De best beoordeelde series per jaar en genre.' },
  ],
  besteWort: (w) => `Beste ${lc(w)}`,
  besteHubTitel: (w) => `Beste ${lc(w)}: toplijsten per jaar en genre`,
  besteHubBeschr: (w) => `Toplijsten van ${lc(w)} per jaar en genre.`,
  reiheH1: (n) => `${n}: films in volgorde van verschijnen`,
  reiheBeschr: (h, n) => `${h}: alle ${n} films met beoordeling en streaminginfo.`,
  alleFilmeUeb: 'Alle films in één oogopslag',
  imAboBei: (l) => `Inbegrepen in het abonnement van: ${l}`,
  keinAboReihe: 'Momenteel bij geen enkel bekend abonnement inbegrepen',
  reiheFuss: (a) => `De volgorde volgt de releasedatum volgens TMDB. Het verhaal kan chronologisch anders verlopen. ${a}`,
  alleReihen: 'Alle filmreeksen',
  reihenTitel: 'Filmreeksen in volgorde van verschijnen',
  reihenBeschr: 'Filmreeksen en franchises met alle films in volgorde van verschijnen, met beoordeling en streaminginfo.',
  reihenH1: 'Filmreeksen en franchises', beliebteReihen: 'Populaire filmreeksen', alleReihenAZ: 'Alle filmreeksen van A tot Z',
  anzahlFilme: (n) => `${n} films`,
  neuStreaming: 'Nieuw op streaming', neustarts: 'Nieuwe releases', neuImKino: 'Nieuw in de bioscoop',
  neuUebTitel: 'Nieuw op streaming: aanwinsten bij Netflix, Prime Video en meer',
  neuUebBeschr: (s, r) => `Nieuwe films en series per streamingdienst (${r}), per ${s}.`,
  neuUebEinleitung: (s, r) => `Per ${s}: wat er onlangs is toegevoegd bij de streamingdiensten (${r}). Een titel geldt als nieuw wanneer MovieMatch hem voor het eerst bij een aanbieder ziet.`,
  neuZeile: (n, tage) => `${n} ${n === 1 ? 'nieuwe titel' : 'nieuwe titels'} in de afgelopen ${tage} dagen`,
  alleAnbieter: 'Alle streamingdiensten',
  zeitraumStreaming: (tage) => `de afgelopen ${tage} dagen`,
  neuAnbTitel: (n, z) => `Nieuw op ${n}: films en series van ${z}`,
  chipFilme: (n) => `Films (${n})`, chipSerien: (n) => `Series (${n})`,
  neueFilme: 'Nieuwe films', neueSerien: 'Nieuwe series',
  alleTitelAuf: (n) => `Alle films en series op ${n}`,
  neuBeiAllen: 'Nieuw bij alle aanbieders', neuBeiAnderen: 'Nieuw bij andere aanbieders',
  zeitraumKino: (tage) => (tage === 7 ? 'deze week' : `de afgelopen ${tage} dagen`),
  kinoNeuTitel: (z) => `Nieuw in de bioscoop: releases ${z} en volgende week`,
  gestartetH2: (tage) => (tage === 7 ? 'Deze week gestart' : `Gestart in de afgelopen ${tage} dagen`),
  keineNeustarts: 'Momenteel geen nieuwe releases gevonden.', naechsteWoche: 'Volgende week',
  kinoUebersicht: 'Bioscoopoverzicht', besteImKino: 'Beste films in de bioscoop',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `Per ${s}: in de afgelopen ${tage} dagen heeft MovieMatch geen nieuwe titels gevonden bij ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'film', 'films'));
    if (serien) teile.push(eins(serien, 'serie', 'series'));
    return `Per ${s}: nieuw bij ${name} in de afgelopen ${tage} dagen: ${teile.join(' en ')}. Een titel geldt als nieuw wanneer MovieMatch hem voor het eerst bij deze aanbieder (${region}) ziet; de lijst is gesorteerd op beoordeling.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `Per ${s}: bioscoopreleases (${region}) in de afgelopen ${tage} dagen: ${eins(gestartet, 'film', 'films')}`
    + (naechste ? `; in de komende 7 dagen: ${eins(naechste, 'extra release', 'extra releases')}` : '')
    + '. Gebaseerd op releasedata, herreleases inbegrepen.',
};

const PT = {
  genreH1: (g, w) => `Melhores ${lc(w)}: ${g}`,
  genreBeschr: (g) => `Os melhores títulos do género ${lc(g)} num relance, ordenados por classificação.`,
  genreListeLink: (g, w) => `Melhores ${lc(w)}: ${g}, a lista`,
  anbieterH1: (n) => `Filmes e séries em ${n}`,
  anbieterBeschr: (n) => `Filmes e séries atuais em ${n} num relance.`,
  besteFilmeAuf: (n) => `Melhores filmes em ${n}`,
  besteSerienAuf: (n) => `Melhores séries em ${n}`,
  neuAuf: (n) => `Novidades em ${n}`,
  ohneSeite: (art) => `${art === 'weitere' ? 'Outros títulos' : 'Novos títulos'} sem página própria:`,
  aktuell: 'Atualidade', nachAnbieter: 'Por serviço de streaming', nachJahrzehnt: 'Por década', nachThema: 'Por tema',
  nachLand: 'Por país', nachSprache: 'Por idioma original', nachStaffeln: 'Por número de temporadas', nachLaufzeit: 'Por duração',
  nachJahr: 'Por ano', nachGenre: 'Por género', verwNachAnbieter: 'Por serviço',
  imKino: (w) => `${w} no cinema`, neueTitel: (w) => `${w} ${w === 'Séries' ? 'novas' : 'novos'}`,
  listeBeschr: (u) => `${u} num relance, ordenados por classificação.`,
  alleGenre: (g, w) => `Todos os ${lc(w)}: ${g}`, alleAuf: (n) => `Todos os títulos em ${n}`,
  kinoStadtTitel: (o) => `Cinema em ${o}: filmes em cartaz`,
  kinoStadtBeschr: (o) => `Estreias e cinemas em ${o} num relance.`,
  neustartsLink: 'Novidades no cinema: estreias desta semana e da próxima',
  aktuellKino: 'Em cartaz', kinosIn: (o) => `Cinemas em ${o}`,
  keineSpielzeiten: 'Os horários ainda não estão disponíveis.', website: 'Website',
  entdeckenTitel: (w) => `Descobrir ${lc(w)}: classificação, streaming e mais`,
  entdeckenH1: (w) => `Descobrir ${lc(w)}`,
  entdeckenBeschr: (w) => `Descubra ${lc(w)} por género, classificação e disponibilidade.`,
  genres: 'Géneros', beliebte: (w) => `${w} populares`,
  kinoHubTitel: 'Cinema: filmes em cartaz e cinemas na sua cidade',
  kinoHubBeschr: 'Estreias de cinema e cinemas por cidade num relance.',
  kinosNachStadt: 'Cinemas por cidade',
  streamingHubTitel: 'Serviços de streaming num relance',
  streamingHubBeschr: 'Filmes e séries por serviço de streaming num relance.',
  neuStreamingLink: 'Novidades em streaming: últimas entradas por serviço',
  titelAnzahl: (n) => `${n} títulos`,
  bestenTitel: 'Melhores listas: melhores filmes e melhores séries',
  bestenBeschr: 'Listas dos melhores filmes e séries, por ano e género.',
  bestenEintraege: [
    { pfad: 'beste-filme', name: 'Melhores filmes', text: 'Os filmes mais bem classificados por ano e género.' },
    { pfad: 'beste-serien', name: 'Melhores séries', text: 'As séries mais bem classificadas por ano e género.' },
  ],
  besteWort: (w) => `Melhores ${lc(w)}`,
  besteHubTitel: (w) => `Melhores ${lc(w)}: listas por ano e género`,
  besteHubBeschr: (w) => `Listas dos melhores ${lc(w)} por ano e género.`,
  reiheH1: (n) => `${n}: filmes por ordem de estreia`,
  reiheBeschr: (h, n) => `${h}: os ${n} filmes com classificação e informação de streaming.`,
  alleFilmeUeb: 'Todos os filmes num relance',
  imAboBei: (l) => `Incluído na subscrição de: ${l}`,
  keinAboReihe: 'Neste momento não incluído em nenhuma subscrição conhecida',
  reiheFuss: (a) => `A ordem segue a data de estreia segundo o TMDB. A história pode seguir outra cronologia. ${a}`,
  alleReihen: 'Todas as sagas',
  reihenTitel: 'Sagas de filmes por ordem de estreia',
  reihenBeschr: 'Sagas e franquias com todos os filmes por ordem de estreia, com classificação e informação de streaming.',
  reihenH1: 'Sagas e franquias', beliebteReihen: 'Sagas populares', alleReihenAZ: 'Todas as sagas de A a Z',
  anzahlFilme: (n) => `${n} filmes`,
  neuStreaming: 'Novidades em streaming', neustarts: 'Estreias', neuImKino: 'Novidades no cinema',
  neuUebTitel: 'Novidades em streaming: entradas na Netflix, Prime Video e mais',
  neuUebBeschr: (s, r) => `Novos filmes e séries por serviço de streaming (${r}), a ${s}.`,
  neuUebEinleitung: (s, r) => `A ${s}: o que foi adicionado recentemente nos serviços de streaming (${r}). Um título conta como novo quando o MovieMatch o vê pela primeira vez num serviço.`,
  neuZeile: (n, tage) => `${n} ${n === 1 ? 'novo título' : 'novos títulos'} nos últimos ${tage} dias`,
  alleAnbieter: 'Todos os serviços de streaming',
  zeitraumStreaming: (tage) => `os últimos ${tage} dias`,
  neuAnbTitel: (n, z) => `Novidades em ${n}: filmes e séries de ${z}`,
  chipFilme: (n) => `Filmes (${n})`, chipSerien: (n) => `Séries (${n})`,
  neueFilme: 'Novos filmes', neueSerien: 'Novas séries',
  alleTitelAuf: (n) => `Todos os filmes e séries em ${n}`,
  neuBeiAllen: 'Novidades em todos os serviços', neuBeiAnderen: 'Novidades noutros serviços',
  zeitraumKino: (tage) => (tage === 7 ? 'esta semana' : `os últimos ${tage} dias`),
  kinoNeuTitel: (z) => `Novidades no cinema: estreias de ${z} e da próxima semana`,
  gestartetH2: (tage) => (tage === 7 ? 'Estreados esta semana' : `Estreados nos últimos ${tage} dias`),
  keineNeustarts: 'De momento não foram detetadas estreias.', naechsteWoche: 'Próxima semana',
  kinoUebersicht: 'Resumo do cinema', besteImKino: 'Melhores filmes no cinema',
  streamingEinleitung: ({ name, tage, filme, serien, standText: s, region }) => {
    if (!filme && !serien) return `A ${s}: nos últimos ${tage} dias, o MovieMatch não detetou novos títulos em ${name}.`;
    const teile = [];
    if (filme) teile.push(eins(filme, 'filme', 'filmes'));
    if (serien) teile.push(eins(serien, 'série', 'séries'));
    return `A ${s}: novidades em ${name} nos últimos ${tage} dias: ${teile.join(' e ')}. Um título conta como novo quando o MovieMatch o vê pela primeira vez neste serviço (${region}); a lista está ordenada por classificação.`;
  },
  kinoEinleitung: ({ tage, gestartet, naechste, standText: s, region }) => `A ${s}: estreias no cinema (${region}) nos últimos ${tage} dias: ${eins(gestartet, 'filme', 'filmes')}`
    + (naechste ? `; nos próximos 7 dias: ${eins(naechste, 'estreia adicional', 'estreias adicionais')}` : '')
    + '. Com base nas datas de estreia, incluindo reposições.',
};

const TEXTE = { de: DE, en: EN, es: ES, fr: FR, it: IT, nl: NL, pt: PT };

// Kacheln der Startseite je Sprache (Pfad = hub-Schluessel in seo_content). Personen
// (schauspieler/regisseur) fehlen bewusst, solange diese Seiten nicht lokalisiert sind.
const START = {
  en: [
    ['filme', 'Movies', 'All movies by genre, with ratings and availability.'],
    ['serien', 'TV series', 'TV series by genre, from the current season to the finale.'],
    ['bestenlisten', 'Top lists', 'Best movies and best TV series by year and genre.'],
    ['reihen', 'Franchises', 'Movie franchises with all films in release order.'],
    ['streaming', 'Streaming', 'What is on which provider.'],
    ['kino', 'Cinema', 'Current cinema releases and cinemas by city.'],
    ['neu-auf', 'New on streaming', 'Recent additions on Netflix, Prime Video and more.'],
    ['kino/neustarts', 'New in cinemas', 'Releases this week and next.'],
  ],
  es: [
    ['filme', 'Películas', 'Todas las películas por género, con valoraciones y disponibilidad.'],
    ['serien', 'Series', 'Series por género, de la temporada actual al final.'],
    ['bestenlisten', 'Mejores listas', 'Mejores películas y mejores series por año y género.'],
    ['reihen', 'Sagas', 'Sagas de películas con todas sus entregas en orden de estreno.'],
    ['streaming', 'Streaming', 'Qué hay en cada plataforma.'],
    ['kino', 'Cine', 'Estrenos de cine y cines por ciudad.'],
    ['neu-auf', 'Novedades en streaming', 'Altas recientes en Netflix, Prime Video y más.'],
    ['kino/neustarts', 'Novedades en el cine', 'Estrenos de esta semana y la próxima.'],
  ],
  fr: [
    ['filme', 'Films', 'Tous les films par genre, avec notes et disponibilité.'],
    ['serien', 'Séries', 'Séries par genre, de la saison en cours au final.'],
    ['bestenlisten', 'Classements', 'Meilleurs films et meilleures séries par année et par genre.'],
    ['reihen', 'Sagas', 'Sagas de films avec tous leurs épisodes dans l’ordre de sortie.'],
    ['streaming', 'Streaming', 'Ce qui passe sur quelle plateforme.'],
    ['kino', 'Cinéma', 'Sorties cinéma et salles par ville.'],
    ['neu-auf', 'Nouveautés en streaming', 'Derniers ajouts sur Netflix, Prime Video et plus.'],
    ['kino/neustarts', 'Nouveautés au cinéma', 'Sorties de cette semaine et de la suivante.'],
  ],
  it: [
    ['filme', 'Film', 'Tutti i film per genere, con voti e disponibilità.'],
    ['serien', 'Serie TV', 'Serie TV per genere, dalla stagione in corso al finale.'],
    ['bestenlisten', 'Classifiche', 'Migliori film e migliori serie TV per anno e genere.'],
    ['reihen', 'Saghe', 'Saghe cinematografiche con tutti i film in ordine di uscita.'],
    ['streaming', 'Streaming', 'Cosa c’è su quale piattaforma.'],
    ['kino', 'Cinema', 'Uscite al cinema e cinema per città.'],
    ['neu-auf', 'Novità in streaming', 'Ultimi arrivi su Netflix, Prime Video e altri.'],
    ['kino/neustarts', 'Novità al cinema', 'Uscite di questa settimana e della prossima.'],
  ],
  nl: [
    ['filme', 'Films', 'Alle films per genre, met beoordelingen en beschikbaarheid.'],
    ['serien', 'Series', 'Series per genre, van het lopende seizoen tot de finale.'],
    ['bestenlisten', 'Toplijsten', 'Beste films en beste series per jaar en genre.'],
    ['reihen', 'Filmreeksen', 'Filmreeksen met alle films in volgorde van verschijnen.'],
    ['streaming', 'Streaming', 'Wat er bij welke aanbieder draait.'],
    ['kino', 'Bioscoop', 'Bioscoopreleases en bioscopen per stad.'],
    ['neu-auf', 'Nieuw op streaming', 'Recente aanwinsten bij Netflix, Prime Video en meer.'],
    ['kino/neustarts', 'Nieuw in de bioscoop', 'Releases van deze en volgende week.'],
  ],
  pt: [
    ['filme', 'Filmes', 'Todos os filmes por género, com classificações e disponibilidade.'],
    ['serien', 'Séries', 'Séries por género, da temporada atual ao final.'],
    ['bestenlisten', 'Melhores listas', 'Melhores filmes e melhores séries por ano e género.'],
    ['reihen', 'Sagas', 'Sagas de filmes com todos os títulos por ordem de estreia.'],
    ['streaming', 'Streaming', 'O que há em cada serviço.'],
    ['kino', 'Cinema', 'Estreias de cinema e cinemas por cidade.'],
    ['neu-auf', 'Novidades em streaming', 'Últimas entradas na Netflix, Prime Video e mais.'],
    ['kino/neustarts', 'Novidades no cinema', 'Estreias desta semana e da próxima.'],
  ],
};

// Themen, Laufzeiten und Staffelzahlen der Bestenlisten je Sprache. name = Chip-Text;
// titel = ganze Listenueberschrift je Typ; kurz = Zusatz hinter "Filme"/"Serien".
const THEMEN_L = {
  en: { weihnachten: { name: 'Christmas', titel: ['Best Christmas movies', 'Best Christmas TV series'] }, 'wahre-begebenheit': { name: 'True story', titel: ['Best movies based on a true story', 'Best TV series based on a true story'] } },
  es: { weihnachten: { name: 'Navidad', titel: ['Mejores películas navideñas', 'Mejores series navideñas'] }, 'wahre-begebenheit': { name: 'Hechos reales', titel: ['Mejores películas basadas en hechos reales', 'Mejores series basadas en hechos reales'] } },
  fr: { weihnachten: { name: 'Noël', titel: ['Meilleurs films de Noël', 'Meilleures séries de Noël'] }, 'wahre-begebenheit': { name: 'Histoire vraie', titel: ['Meilleurs films tirés d’une histoire vraie', 'Meilleures séries tirées d’une histoire vraie'] } },
  it: { weihnachten: { name: 'Natale', titel: ['I migliori film di Natale', 'Le migliori serie TV di Natale'] }, 'wahre-begebenheit': { name: 'Storia vera', titel: ['I migliori film tratti da storie vere', 'Le migliori serie TV tratte da storie vere'] } },
  nl: { weihnachten: { name: 'Kerst', titel: ['Beste kerstfilms', 'Beste kerstseries'] }, 'wahre-begebenheit': { name: 'Waargebeurd', titel: ['Beste films gebaseerd op een waargebeurd verhaal', 'Beste series gebaseerd op een waargebeurd verhaal'] } },
  pt: { weihnachten: { name: 'Natal', titel: ['Melhores filmes de Natal', 'Melhores séries de Natal'] }, 'wahre-begebenheit': { name: 'Factos reais', titel: ['Melhores filmes baseados em factos reais', 'Melhores séries baseadas em factos reais'] } },
};
const LAUFZEIT_L = {
  en: { 'unter-90': 'under 90 minutes', 'ueber-150': 'over 150 minutes' },
  es: { 'unter-90': 'de menos de 90 minutos', 'ueber-150': 'de más de 150 minutos' },
  fr: { 'unter-90': 'de moins de 90 minutes', 'ueber-150': 'de plus de 150 minutes' },
  it: { 'unter-90': 'di meno di 90 minuti', 'ueber-150': 'di più di 150 minuti' },
  nl: { 'unter-90': 'korter dan 90 minuten', 'ueber-150': 'langer dan 150 minuten' },
  pt: { 'unter-90': 'com menos de 90 minutos', 'ueber-150': 'com mais de 150 minutos' },
};
const STAFFELN_L = {
  en: { eine: 'with one season', 'ab-5': 'with five or more seasons' },
  es: { eine: 'con una temporada', 'ab-5': 'con cinco o más temporadas' },
  fr: { eine: 'avec une saison', 'ab-5': 'avec cinq saisons ou plus' },
  it: { eine: 'con una stagione', 'ab-5': 'con cinque o più stagioni' },
  nl: { eine: 'met één seizoen', 'ab-5': 'met vijf of meer seizoenen' },
  pt: { eine: 'com uma temporada', 'ab-5': 'com cinco ou mais temporadas' },
};
const JAHRZEHNT_L = {
  en: (j) => `${j}s`, es: (j) => `Años ${j}`, fr: (j) => `Années ${j}`, it: (j) => `Anni ${j}`, nl: (j) => `Jaren ${j}`, pt: (j) => `Anos ${j}`,
};

// Listenueberschriften (Bestenlisten) je Sprache. B = "Beste Filme"-Wortgruppe,
// W = Typwort; Namen (genre, anbieter, land, sprache) sind schon in der Sprache.
const LISTEN = {
  en: {
    B: ['Best Movies', 'Best TV series'], neu: ['Best new movies', 'Best new TV series'],
    jahr: (B, y) => `${B} ${y}`, genre: (B, g, W) => `Best ${g} ${W}`, anbieter: (B, a) => `${B} on ${a}`,
    jz: (B, j) => `${B} of the ${j}`, land: (B, l) => `${B} from ${l}`, sprache: (B, s) => `${B} in ${s}`,
    genreJz: (B, g, j, W) => `Best ${g} ${W} of the ${j}`, genreAnb: (B, g, a, W) => `Best ${g} ${W} on ${a}`,
    landGenre: (B, g, l, W) => `Best ${g} ${W} from ${l}`, kino: (B) => `${B} in cinemas`, zusatz: (B, k) => `${B} ${k}`,
  },
  es: {
    B: ['Mejores películas', 'Mejores series'], neu: ['Mejores películas nuevas', 'Mejores series nuevas'],
    jahr: (B, y) => `${B} de ${y}`, genre: (B, g) => `${B} de ${lc(g)}`, anbieter: (B, a) => `${B} en ${a}`,
    jz: (B, j) => `${B} de los ${lc(j)}`, land: (B, l) => `${B} de ${l}`, sprache: (B, s) => `${B} en ${lc(s)}`,
    genreJz: (B, g, j) => `${B} de ${lc(g)} de los ${lc(j)}`, genreAnb: (B, g, a) => `${B} de ${lc(g)} en ${a}`,
    landGenre: (B, g, l) => `${B} de ${lc(g)} de ${l}`, kino: (B) => `${B} en el cine`, zusatz: (B, k) => `${B} ${k}`,
  },
  fr: {
    B: ['Meilleurs films', 'Meilleures séries'], neu: ['Meilleurs nouveaux films', 'Meilleures nouvelles séries'],
    jahr: (B, y) => `${B} ${y}`, genre: (B, g) => `${B} : ${g}`, anbieter: (B, a) => `${B} sur ${a}`,
    jz: (B, j) => `${B} des ${lc(j)}`, land: (B, l) => `${B} : ${l}`, sprache: (B, s) => `${B} en ${lc(s)}`,
    genreJz: (B, g, j) => `${B} : ${g}, ${lc(j)}`, genreAnb: (B, g, a) => `${B} : ${g} sur ${a}`,
    landGenre: (B, g, l) => `${B} : ${g}, ${l}`, kino: (B) => `${B} au cinéma`, zusatz: (B, k) => `${B} ${k}`,
  },
  it: {
    B: ['I migliori film', 'Le migliori serie TV'], neu: ['I migliori nuovi film', 'Le migliori nuove serie TV'],
    jahr: (B, y) => `${B} del ${y}`, genre: (B, g) => `${B}: ${g}`, anbieter: (B, a) => `${B} su ${a}`,
    jz: (B, j) => `${B} degli ${lc(j)}`, land: (B, l) => `${B}: ${l}`, sprache: (B, s) => `${B} in ${lc(s)}`,
    genreJz: (B, g, j) => `${B}: ${g}, ${lc(j)}`, genreAnb: (B, g, a) => `${B}: ${g} su ${a}`,
    landGenre: (B, g, l) => `${B}: ${g}, ${l}`, kino: (B) => `${B} al cinema`, zusatz: (B, k) => `${B} ${k}`,
  },
  nl: {
    B: ['Beste films', 'Beste series'], neu: ['Beste nieuwe films', 'Beste nieuwe series'],
    jahr: (B, y) => `${B} ${y}`, genre: (B, g) => `${B}: ${g}`, anbieter: (B, a) => `${B} op ${a}`,
    jz: (B, j) => `${B} uit de ${lc(j)}`, land: (B, l) => `${B} uit ${l}`, sprache: (B, s) => `${B} in het ${lc(s)}`,
    genreJz: (B, g, j) => `${B}: ${g}, ${lc(j)}`, genreAnb: (B, g, a) => `${B}: ${g} op ${a}`,
    landGenre: (B, g, l) => `${B}: ${g} uit ${l}`, kino: (B) => `${B} in de bioscoop`, zusatz: (B, k) => `${B} ${k}`,
  },
  pt: {
    B: ['Melhores filmes', 'Melhores séries'], neu: ['Melhores filmes novos', 'Melhores séries novas'],
    jahr: (B, y) => `${B} de ${y}`, genre: (B, g) => `${B}: ${g}`, anbieter: (B, a) => `${B} em ${a}`,
    jz: (B, j) => `${B} dos ${lc(j)}`, land: (B, l) => `${B} de ${l}`, sprache: (B, s) => `${B} em ${lc(s)}`,
    genreJz: (B, g, j) => `${B}: ${g}, ${lc(j)}`, genreAnb: (B, g, a) => `${B}: ${g} em ${a}`,
    landGenre: (B, g, l) => `${B}: ${g}, ${l}`, kino: (B) => `${B} no cinema`, zusatz: (B, k) => `${B} ${k}`,
  },
};

// Listenueberschrift fuer Nicht-de-Sprachen. Gleiche Argumente wie listeTitel in
// seoBestenlisten.js (die de-Fassung bleibt dort).
export function listeTitelLokal(sprache, type, modus, wert, namen = {}) {
  const S = LISTEN[sprache] || LISTEN.en;
  const i = type === 'series' ? 1 : 0;
  const B = S.B[i];
  const typWort = sprachTypWort(sprache, type);
  const [, teil2] = String(wert).split('+');
  const jz = (j) => jahrzehntNameL(j, sprache);
  switch (modus) {
    case 'jahr': return S.jahr(B, wert);
    case 'genre': return S.genre(B, namen.genre, typWort);
    case 'anbieter': return S.anbieter(B, namen.anbieter);
    case 'jahrzehnt': return S.jz(B, jz(wert));
    case 'thema': return (THEMEN_L[sprache] || THEMEN_L.en)[wert].titel[i];
    case 'genre-jahrzehnt': return S.genreJz(B, namen.genre, jz(teil2), typWort);
    case 'genre-anbieter': return S.genreAnb(B, namen.genre, namen.anbieter, typWort);
    case 'land': return S.land(B, namen.land);
    case 'sprache': return S.sprache(B, namen.sprache);
    case 'laufzeit': return S.zusatz(B, (LAUFZEIT_L[sprache] || LAUFZEIT_L.en)[wert]);
    case 'staffeln': return S.zusatz(B, (STAFFELN_L[sprache] || STAFFELN_L.en)[wert]);
    case 'land-genre': return S.landGenre(B, namen.genre, namen.land, typWort);
    case 'kino': return S.kino(B);
    case 'neu': return S.neu[i];
    default: return B;
  }
}

// "Movies"/"TV series" usw. -- das Bereichswort aus seoTexte.js.
const TYP_WORT = {
  en: ['Movies', 'TV series'], es: ['películas', 'series'], fr: ['films', 'séries'], it: ['film', 'serie TV'],
  nl: ['films', 'series'], pt: ['filmes', 'séries'],
};
function sprachTypWort(sprache, type) {
  return (TYP_WORT[sprache] || TYP_WORT.en)[type === 'series' ? 1 : 0];
}

export function jahrzehntNameL(jz, sprache) {
  const f = JAHRZEHNT_L[sprache];
  return f ? f(jz) : `${jz}er`;
}
export function themaName(slug, sprache, deName) {
  return sprache === 'de' ? deName : ((THEMEN_L[sprache] || THEMEN_L.en)[slug] || {}).name || deName;
}
export function laufzeitKurz(slug, sprache, deKurz) {
  return sprache === 'de' ? deKurz : ((LAUFZEIT_L[sprache] || LAUFZEIT_L.en)[slug] || deKurz);
}
export function staffelnKurz(slug, sprache, deKurz) {
  return sprache === 'de' ? deKurz : ((STAFFELN_L[sprache] || STAFFELN_L.en)[slug] || deKurz);
}

const regionNamen = new Map();
function regionName(sprache, region) {
  const key = sprache + region;
  if (!regionNamen.has(key)) {
    let n = region;
    try { n = new Intl.DisplayNames([sprache], { type: 'region' }).of(region) || region; } catch { /* Code als Name */ }
    regionNamen.set(key, n);
  }
  return regionNamen.get(key);
}

// Datum 'YYYY-MM-DD' in der Schreibweise der Locale ('12.10.2026' fuer de-de).
function datumLokal(iso, locale) {
  if (locale.startsWith('de-')) return datumDeutsch(iso);
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(locale.replace(/-([a-z]+)$/, (_, l) => '-' + l.toUpperCase()), { timeZone: 'UTC' });
}

// Alle Vorlagen fuer ein Locale. Wochen-Einleitungen und Datumsangaben sind
// schon an das Locale gebunden; Kacheln der Startseite gibt es nur ausserhalb von de.
export function seitenTexte(locale, region) {
  const sprache = sprachVon(locale);
  const basis = { ...EN, ...(TEXTE[sprache] || EN) };
  const regionText = regionName(sprache, region || 'DE');
  return {
    ...basis,
    datum: (iso) => datumLokal(iso, locale),
    region: regionText,
    streamingEinleitung: (o) => basis.streamingEinleitung({ ...o, standText: datumLokal(o.stand, locale), region: regionText }),
    kinoEinleitung: (o) => basis.kinoEinleitung({ ...o, standText: datumLokal(o.stand, locale), region: regionText }),
    neuUebBeschr: (iso) => basis.neuUebBeschr(datumLokal(iso, locale), regionText),
    neuUebEinleitung: (iso) => basis.neuUebEinleitung(datumLokal(iso, locale), regionText),
    startKacheln: (START[sprache] || []).map(([pfad, titel, text]) => ({ pfad, titel, text })),
  };
}
