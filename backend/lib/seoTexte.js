// Feste Texte ("Chrome") der SEO-Seiten je Sprache. Redaktionstexte kommen aus
// seo_content, Katalogdaten aus der Datenbank -- hier steht nur, was der Renderer
// selbst schreibt. Deutsch ist die Referenz; fehlt ein Schluessel, greift Englisch.
import { sprachVon } from './seoLocale.js';

const DE = {
  zurApp: 'Zur App', start: 'Start', uebersichtsseiten: 'Übersichtsseiten',
  impressum: 'Impressum', datenschutz: 'Datenschutz', cookies: 'Cookie-Einstellungen',
  brotkrumen: 'Brotkrumen',
  bereiche: { filme: 'Filme', serien: 'Serien', schauspieler: 'Schauspieler', regisseur: 'Regisseure', bestenlisten: 'Bestenlisten', reihen: 'Reihen', streaming: 'Streaming', kino: 'Kino' },
  titelSuffix: 'Stream, Bewertung & Kino',
  titelBeschr: (t) => `${t}: Verfuegbarkeit, Bewertung und mehr auf MovieMatch.`,
  regie: 'Regie', idee: 'Idee', genre: 'Genre', laufzeit: 'Laufzeit', minuten: (n) => `${n} Minuten`,
  erscheinung: 'Erscheinungsdatum', jahr: 'Jahr', freigabe: 'Altersfreigabe', freigabeWert: (c) => 'FSK ' + c,
  budget: 'Budget', einspiel: 'Einspielergebnis', tmdb: 'TMDB-Bewertung', stimmen: (n) => `${n} Stimmen`,
  community: 'Community-Bewertung', communityWert: (d, n) => `${d} von 10 (${n} Bewertungen)`,
  verfuegbarBei: 'Verfügbar bei', cta: 'Zur Watchlist hinzufügen', kurz: 'Kurzüberblick',
  trailer: 'Trailer', trailerVon: (t) => `Trailer zu ${t}`, bilder: 'Bilder', besetzung: 'Besetzung & Stab',
  als: 'als', keineBesetzung: 'Keine Besetzung hinterlegt.', weitereVon: (r) => `Weitere Filme von ${r}`,
  reiheTeil: (l, n) => `Teil der Reihe ${l} — alle ${n} Filme in Erscheinungsreihenfolge.`,
  aehnliche: 'Ähnliche Titel', verfuegbarkeit: 'Verfügbarkeit',
  keinAbo: 'Aktuell bei keinem bekannten Streaming-Anbieter im Abo verfuegbar.',
  imAbo: (liste) => `Im Abo verfuegbar bei: ${liste}.`,
  keineBeschreibung: 'Beschreibung folgt in Kuerze.',
  startTitel: 'Filme & Serien im Überblick',
  startBeschr: 'Filme und Serien nach Genre, Bestenlisten, Streaming-Anbieter und Kinostarts im Überblick.',
  nf404Titel: 'Seite nicht gefunden', nf404Beschr: 'Diese Seite gibt es nicht (mehr).',
  nf404Text: 'Vielleicht wurde der Titel/die Seite entfernt.',
};

const EN = {
  zurApp: 'Open the app', start: 'Home', uebersichtsseiten: 'Overview pages',
  impressum: 'Imprint', datenschutz: 'Privacy', cookies: 'Cookie settings', brotkrumen: 'Breadcrumbs',
  bereiche: { filme: 'Movies', serien: 'TV series', schauspieler: 'Actors', regisseur: 'Directors', bestenlisten: 'Top lists', reihen: 'Franchises', streaming: 'Streaming', kino: 'Cinema' },
  titelSuffix: 'Streaming, Rating & Cinema',
  titelBeschr: (t) => `${t}: availability, rating and more on MovieMatch.`,
  regie: 'Director', idee: 'Created by', genre: 'Genre', laufzeit: 'Runtime', minuten: (n) => `${n} minutes`,
  erscheinung: 'Release date', jahr: 'Year', freigabe: 'Age rating', freigabeWert: (c) => c,
  budget: 'Budget', einspiel: 'Box office', tmdb: 'TMDB rating', stimmen: (n) => `${n} votes`,
  community: 'Community rating', communityWert: (d, n) => `${d} out of 10 (${n} ratings)`,
  verfuegbarBei: 'Available on', cta: 'Add to watchlist', kurz: 'At a glance',
  trailer: 'Trailer', trailerVon: (t) => `Trailer for ${t}`, bilder: 'Images', besetzung: 'Cast & crew',
  als: 'as', keineBesetzung: 'No cast information available.', weitereVon: (r) => `More films by ${r}`,
  reiheTeil: (l, n) => `Part of the ${l} series — all ${n} films in release order.`,
  aehnliche: 'Similar titles', verfuegbarkeit: 'Availability',
  keinAbo: 'Not currently included in any known streaming subscription.',
  imAbo: (liste) => `Included with a subscription on: ${liste}.`,
  keineBeschreibung: 'Description coming soon.',
  startTitel: 'Movies & TV series at a glance',
  startBeschr: 'Movies and TV series by genre, top lists, streaming providers and cinema releases at a glance.',
  nf404Titel: 'Page not found', nf404Beschr: 'This page does not exist (any more).',
  nf404Text: 'The title or page may have been removed.',
};

const ES = {
  zurApp: 'Abrir la app', start: 'Inicio', uebersichtsseiten: 'Páginas de resumen',
  impressum: 'Aviso legal', datenschutz: 'Privacidad', cookies: 'Ajustes de cookies', brotkrumen: 'Ruta de navegación',
  bereiche: { filme: 'Películas', serien: 'Series', schauspieler: 'Actores', regisseur: 'Directores', bestenlisten: 'Mejores listas', reihen: 'Sagas', streaming: 'Streaming', kino: 'Cine' },
  titelSuffix: 'Streaming, valoración y cine',
  titelBeschr: (t) => `${t}: disponibilidad, valoración y más en MovieMatch.`,
  regie: 'Dirección', idee: 'Creada por', genre: 'Género', laufzeit: 'Duración', minuten: (n) => `${n} minutos`,
  erscheinung: 'Fecha de estreno', jahr: 'Año', freigabe: 'Clasificación por edad', freigabeWert: (c) => c,
  budget: 'Presupuesto', einspiel: 'Recaudación', tmdb: 'Valoración TMDB', stimmen: (n) => `${n} votos`,
  community: 'Valoración de la comunidad', communityWert: (d, n) => `${d} de 10 (${n} valoraciones)`,
  verfuegbarBei: 'Disponible en', cta: 'Añadir a la watchlist', kurz: 'Resumen rápido',
  trailer: 'Tráiler', trailerVon: (t) => `Tráiler de ${t}`, bilder: 'Imágenes', besetzung: 'Reparto y equipo',
  als: 'como', keineBesetzung: 'No hay reparto disponible.', weitereVon: (r) => `Más películas de ${r}`,
  reiheTeil: (l, n) => `Parte de la saga ${l}: las ${n} películas en orden de estreno.`,
  aehnliche: 'Títulos similares', verfuegbarkeit: 'Disponibilidad',
  keinAbo: 'Ahora mismo no está incluido en ninguna suscripción de streaming conocida.',
  imAbo: (liste) => `Incluido en la suscripción de: ${liste}.`,
  keineBeschreibung: 'La descripción llegará pronto.',
  startTitel: 'Películas y series de un vistazo',
  startBeschr: 'Películas y series por género, listas de lo mejor, plataformas de streaming y estrenos de cine de un vistazo.',
  nf404Titel: 'Página no encontrada', nf404Beschr: 'Esta página no existe (o ya no existe).',
  nf404Text: 'Puede que el título o la página se haya eliminado.',
};

const FR = {
  zurApp: 'Ouvrir l’appli', start: 'Accueil', uebersichtsseiten: 'Pages de synthèse',
  impressum: 'Mentions légales', datenschutz: 'Confidentialité', cookies: 'Paramètres des cookies', brotkrumen: 'Fil d’Ariane',
  bereiche: { filme: 'Films', serien: 'Séries', schauspieler: 'Acteurs', regisseur: 'Réalisateurs', bestenlisten: 'Classements', reihen: 'Sagas', streaming: 'Streaming', kino: 'Cinéma' },
  titelSuffix: 'Streaming, note et cinéma',
  titelBeschr: (t) => `${t} : disponibilité, note et plus encore sur MovieMatch.`,
  regie: 'Réalisation', idee: 'Créée par', genre: 'Genre', laufzeit: 'Durée', minuten: (n) => `${n} minutes`,
  erscheinung: 'Date de sortie', jahr: 'Année', freigabe: 'Classification', freigabeWert: (c) => c,
  budget: 'Budget', einspiel: 'Recettes', tmdb: 'Note TMDB', stimmen: (n) => `${n} votes`,
  community: 'Note de la communauté', communityWert: (d, n) => `${d} sur 10 (${n} notes)`,
  verfuegbarBei: 'Disponible sur', cta: 'Ajouter à la watchlist', kurz: 'En bref',
  trailer: 'Bande-annonce', trailerVon: (t) => `Bande-annonce de ${t}`, bilder: 'Images', besetzung: 'Distribution et équipe',
  als: 'dans le rôle de', keineBesetzung: 'Aucune distribution disponible.', weitereVon: (r) => `Autres films de ${r}`,
  reiheTeil: (l, n) => `Fait partie de la saga ${l} : les ${n} films dans l’ordre de sortie.`,
  aehnliche: 'Titres similaires', verfuegbarkeit: 'Disponibilité',
  keinAbo: 'Actuellement inclus dans aucun abonnement de streaming connu.',
  imAbo: (liste) => `Inclus dans l’abonnement de : ${liste}.`,
  keineBeschreibung: 'La description arrive bientôt.',
  startTitel: 'Films et séries en un coup d’œil',
  startBeschr: 'Films et séries par genre, classements, plateformes de streaming et sorties cinéma en un coup d’œil.',
  nf404Titel: 'Page introuvable', nf404Beschr: 'Cette page n’existe pas (ou plus).',
  nf404Text: 'Le titre ou la page a peut-être été supprimé.',
};

const IT = {
  zurApp: 'Apri l’app', start: 'Home', uebersichtsseiten: 'Pagine di panoramica',
  impressum: 'Note legali', datenschutz: 'Privacy', cookies: 'Impostazioni dei cookie', brotkrumen: 'Percorso di navigazione',
  bereiche: { filme: 'Film', serien: 'Serie TV', schauspieler: 'Attori', regisseur: 'Registi', bestenlisten: 'Classifiche', reihen: 'Saghe', streaming: 'Streaming', kino: 'Cinema' },
  titelSuffix: 'Streaming, voto e cinema',
  titelBeschr: (t) => `${t}: disponibilità, voto e altro su MovieMatch.`,
  regie: 'Regia', idee: 'Ideata da', genre: 'Genere', laufzeit: 'Durata', minuten: (n) => `${n} minuti`,
  erscheinung: 'Data di uscita', jahr: 'Anno', freigabe: 'Classificazione', freigabeWert: (c) => c,
  budget: 'Budget', einspiel: 'Incassi', tmdb: 'Voto TMDB', stimmen: (n) => `${n} voti`,
  community: 'Voto della community', communityWert: (d, n) => `${d} su 10 (${n} valutazioni)`,
  verfuegbarBei: 'Disponibile su', cta: 'Aggiungi alla watchlist', kurz: 'In breve',
  trailer: 'Trailer', trailerVon: (t) => `Trailer di ${t}`, bilder: 'Immagini', besetzung: 'Cast e troupe',
  als: 'nel ruolo di', keineBesetzung: 'Nessun cast disponibile.', weitereVon: (r) => `Altri film di ${r}`,
  reiheTeil: (l, n) => `Parte della saga ${l}: tutti i ${n} film in ordine di uscita.`,
  aehnliche: 'Titoli simili', verfuegbarkeit: 'Disponibilità',
  keinAbo: 'Al momento non incluso in alcun abbonamento di streaming noto.',
  imAbo: (liste) => `Incluso nell’abbonamento di: ${liste}.`,
  keineBeschreibung: 'La descrizione arriverà presto.',
  startTitel: 'Film e serie TV in breve',
  startBeschr: 'Film e serie TV per genere, classifiche, piattaforme di streaming e uscite al cinema in breve.',
  nf404Titel: 'Pagina non trovata', nf404Beschr: 'Questa pagina non esiste (più).',
  nf404Text: 'Il titolo o la pagina potrebbe essere stato rimosso.',
};

const NL = {
  zurApp: 'Naar de app', start: 'Start', uebersichtsseiten: 'Overzichtspagina’s',
  impressum: 'Colofon', datenschutz: 'Privacy', cookies: 'Cookie-instellingen', brotkrumen: 'Kruimelpad',
  bereiche: { filme: 'Films', serien: 'Series', schauspieler: 'Acteurs', regisseur: 'Regisseurs', bestenlisten: 'Toplijsten', reihen: 'Filmreeksen', streaming: 'Streaming', kino: 'Bioscoop' },
  titelSuffix: 'Streaming, beoordeling & bioscoop',
  titelBeschr: (t) => `${t}: beschikbaarheid, beoordeling en meer op MovieMatch.`,
  regie: 'Regie', idee: 'Bedacht door', genre: 'Genre', laufzeit: 'Speelduur', minuten: (n) => `${n} minuten`,
  erscheinung: 'Releasedatum', jahr: 'Jaar', freigabe: 'Leeftijdsclassificatie', freigabeWert: (c) => c,
  budget: 'Budget', einspiel: 'Opbrengst', tmdb: 'TMDB-beoordeling', stimmen: (n) => `${n} stemmen`,
  community: 'Beoordeling van de community', communityWert: (d, n) => `${d} van 10 (${n} beoordelingen)`,
  verfuegbarBei: 'Beschikbaar bij', cta: 'Toevoegen aan watchlist', kurz: 'In het kort',
  trailer: 'Trailer', trailerVon: (t) => `Trailer van ${t}`, bilder: 'Afbeeldingen', besetzung: 'Cast & crew',
  als: 'als', keineBesetzung: 'Geen cast beschikbaar.', weitereVon: (r) => `Meer films van ${r}`,
  reiheTeil: (l, n) => `Onderdeel van de reeks ${l}: alle ${n} films in volgorde van verschijnen.`,
  aehnliche: 'Vergelijkbare titels', verfuegbarkeit: 'Beschikbaarheid',
  keinAbo: 'Momenteel bij geen enkel bekend streamingabonnement inbegrepen.',
  imAbo: (liste) => `Inbegrepen in het abonnement van: ${liste}.`,
  keineBeschreibung: 'Beschrijving volgt binnenkort.',
  startTitel: 'Films en series in één oogopslag',
  startBeschr: 'Films en series per genre, toplijsten, streamingdiensten en bioscoopreleases in één oogopslag.',
  nf404Titel: 'Pagina niet gevonden', nf404Beschr: 'Deze pagina bestaat niet (meer).',
  nf404Text: 'Mogelijk is de titel of pagina verwijderd.',
};

const PT = {
  zurApp: 'Abrir a app', start: 'Início', uebersichtsseiten: 'Páginas de resumo',
  impressum: 'Aviso legal', datenschutz: 'Privacidade', cookies: 'Definições de cookies', brotkrumen: 'Caminho de navegação',
  bereiche: { filme: 'Filmes', serien: 'Séries', schauspieler: 'Atores', regisseur: 'Realizadores', bestenlisten: 'Melhores listas', reihen: 'Sagas', streaming: 'Streaming', kino: 'Cinema' },
  titelSuffix: 'Streaming, classificação e cinema',
  titelBeschr: (t) => `${t}: disponibilidade, classificação e mais no MovieMatch.`,
  regie: 'Realização', idee: 'Criada por', genre: 'Género', laufzeit: 'Duração', minuten: (n) => `${n} minutos`,
  erscheinung: 'Data de estreia', jahr: 'Ano', freigabe: 'Classificação etária', freigabeWert: (c) => c,
  budget: 'Orçamento', einspiel: 'Bilheteira', tmdb: 'Avaliação TMDB', stimmen: (n) => `${n} votos`,
  community: 'Avaliação da comunidade', communityWert: (d, n) => `${d} em 10 (${n} avaliações)`,
  verfuegbarBei: 'Disponível em', cta: 'Adicionar à watchlist', kurz: 'Em resumo',
  trailer: 'Trailer', trailerVon: (t) => `Trailer de ${t}`, bilder: 'Imagens', besetzung: 'Elenco e equipa',
  als: 'como', keineBesetzung: 'Sem elenco disponível.', weitereVon: (r) => `Mais filmes de ${r}`,
  reiheTeil: (l, n) => `Parte da saga ${l}: os ${n} filmes por ordem de estreia.`,
  aehnliche: 'Títulos semelhantes', verfuegbarkeit: 'Disponibilidade',
  keinAbo: 'Neste momento não está incluído em nenhuma subscrição de streaming conhecida.',
  imAbo: (liste) => `Incluído na subscrição de: ${liste}.`,
  keineBeschreibung: 'A descrição chega em breve.',
  startTitel: 'Filmes e séries num relance',
  startBeschr: 'Filmes e séries por género, melhores listas, serviços de streaming e estreias no cinema num relance.',
  nf404Titel: 'Página não encontrada', nf404Beschr: 'Esta página não existe (ou já não existe).',
  nf404Text: 'O título ou a página pode ter sido removido.',
};

export const SEO_TEXTE = { de: DE, en: EN, es: ES, fr: FR, it: IT, nl: NL, pt: PT };

// Abschnittsueberschriften des Vier-Abschnitte-Formats je Sprache, in der
// Reihenfolge der deutschen NEUE_ABSCHNITTE. Identisch mit SPRACHEN in
// scripts/seo-batch.mjs (seoTexte.test.js prueft das).
export const ABSCHNITTE = {
  de: ['Worum es geht', 'Entstehungsgeschichte', 'Hinter den Kulissen', 'Einordnung & Wirkung'],
  en: ['What it is about', 'How it came about', 'Behind the scenes', 'Context and impact'],
  es: ['De qué trata', 'Cómo surgió', 'Detrás de las cámaras', 'Contexto y repercusión'],
  fr: ['De quoi il s’agit', 'Genèse du projet', 'Dans les coulisses', 'Portée et réception'],
  it: ['Di cosa si tratta', 'Come è nato', 'Dietro le quinte', 'Contesto e ricezione'],
  nl: ['Waar het over gaat', 'Hoe het ontstond', 'Achter de schermen', 'Context en ontvangst'],
  pt: ['Do que se trata', 'Como surgiu', 'Nos bastidores', 'Contexto e repercussão'],
};

// Texte fuer ein Locale ('en-gb' -> Englisch). Fehlende Schluessel fallen auf Englisch zurueck.
export function seoTexte(locale) {
  return { ...EN, ...(SEO_TEXTE[sprachVon(locale)] || EN) };
}

// Zahl mit den Trennzeichen der Sprache (Dezimalkomma bzw. -punkt).
export function zahlFormat(wert, locale, optionen) {
  return new Intl.NumberFormat(locale.replace(/-([a-z]+)$/, (_, l) => '-' + l.toUpperCase()), optionen).format(Number(wert));
}
