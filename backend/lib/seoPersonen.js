// Oberflaechentexte der Personenseiten in den uebersetzten Locales (de-de steht
// direkt in seoRender.js). `abschnitte` = Ueberschriften der drei Textteile in
// derselben Reihenfolge wie 'Werdegang', 'Filmografie bei uns', 'Einordnung';
// scripts/seo-kategorien-uebersetzen.mjs erzeugt die Texte mit genau diesen.
export const PERSON_TX = {
  en: {
    abschnitte: ['Career', 'Filmography in our catalogue', 'Assessment'],
    rolle: { schauspieler: 'Actor', regisseur: 'Director' },
    geboren: 'born', filmografie: 'Filmography', regie: ' (as director)',
    titelZeile: (name) => `${name} — Films & TV in Overview | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'title' : 'titles'}`,
    hub: {
      schauspieler: { titel: 'Actors', ueberschrift: 'Familiar faces', titelZeile: 'Actors: filmography & best-known roles | MovieMatch', beschreibung: 'Well-known actors with filmography, ratings and availability.' },
      regisseur: { titel: 'Directors', ueberschrift: 'Directors with the most titles', titelZeile: 'Directors: filmography & best-known films | MovieMatch', beschreibung: 'Well-known directors with filmography, ratings and availability.' },
    },
  },
  fr: {
    abschnitte: ['Parcours', 'Filmographie chez nous', 'Analyse'],
    rolle: { schauspieler: 'Acteur', regisseur: 'Réalisateur' },
    geboren: 'né(e) le', filmografie: 'Filmographie', regie: ' (réalisation)',
    titelZeile: (name) => `${name} — films et séries en un coup d’œil | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'titre' : 'titres'}`,
    hub: {
      schauspieler: { titel: 'Acteurs', ueberschrift: 'Visages familiers', titelZeile: 'Acteurs : filmographie et rôles les plus connus | MovieMatch', beschreibung: 'Acteurs connus avec filmographie, notes et disponibilité.' },
      regisseur: { titel: 'Réalisateurs', ueberschrift: 'Réalisateurs avec le plus de titres', titelZeile: 'Réalisateurs : filmographie et films les plus connus | MovieMatch', beschreibung: 'Réalisateurs connus avec filmographie, notes et disponibilité.' },
    },
  },
  es: {
    abschnitte: ['Trayectoria', 'Filmografía en nuestro catálogo', 'Valoración'],
    rolle: { schauspieler: 'Actor', regisseur: 'Director' },
    geboren: 'nacido/a el', filmografie: 'Filmografía', regie: ' (dirección)',
    titelZeile: (name) => `${name} — películas y series de un vistazo | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'título' : 'títulos'}`,
    hub: {
      schauspieler: { titel: 'Actores', ueberschrift: 'Caras conocidas', titelZeile: 'Actores: filmografía y papeles más conocidos | MovieMatch', beschreibung: 'Actores conocidos con filmografía, valoraciones y disponibilidad.' },
      regisseur: { titel: 'Directores', ueberschrift: 'Directores con más títulos', titelZeile: 'Directores: filmografía y películas más conocidas | MovieMatch', beschreibung: 'Directores conocidos con filmografía, valoraciones y disponibilidad.' },
    },
  },
  it: {
    abschnitte: ['Percorso', 'Filmografia nel nostro catalogo', 'Valutazione'],
    rolle: { schauspieler: 'Attore', regisseur: 'Regista' },
    geboren: 'nato/a il', filmografie: 'Filmografia', regie: ' (regia)',
    titelZeile: (name) => `${name} — film e serie in sintesi | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'titolo' : 'titoli'}`,
    hub: {
      schauspieler: { titel: 'Attori', ueberschrift: 'Volti noti', titelZeile: 'Attori: filmografia e ruoli più noti | MovieMatch', beschreibung: 'Attori noti con filmografia, valutazioni e disponibilità.' },
      regisseur: { titel: 'Registi', ueberschrift: 'Registi con più titoli', titelZeile: 'Registi: filmografia e film più noti | MovieMatch', beschreibung: 'Registi noti con filmografia, valutazioni e disponibilità.' },
    },
  },
  nl: {
    abschnitte: ['Loopbaan', 'Filmografie in onze catalogus', 'Beoordeling'],
    rolle: { schauspieler: 'Acteur', regisseur: 'Regisseur' },
    geboren: 'geboren op', filmografie: 'Filmografie', regie: ' (regie)',
    titelZeile: (name) => `${name} — films en series in één overzicht | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'titel' : 'titels'}`,
    hub: {
      schauspieler: { titel: 'Acteurs', ueberschrift: 'Bekende gezichten', titelZeile: 'Acteurs: filmografie en bekendste rollen | MovieMatch', beschreibung: 'Bekende acteurs met filmografie, beoordelingen en beschikbaarheid.' },
      regisseur: { titel: 'Regisseurs', ueberschrift: 'Regisseurs met de meeste titels', titelZeile: 'Regisseurs: filmografie en bekendste films | MovieMatch', beschreibung: 'Bekende regisseurs met filmografie, beoordelingen en beschikbaarheid.' },
    },
  },
  pt: {
    abschnitte: ['Percurso', 'Filmografia no nosso catálogo', 'Apreciação'],
    rolle: { schauspieler: 'Ator', regisseur: 'Realizador' },
    geboren: 'nascido/a em', filmografie: 'Filmografia', regie: ' (realização)',
    titelZeile: (name) => `${name} — filmes e séries num relance | MovieMatch`,
    titelAnzahl: (n) => `${n} ${n === 1 ? 'título' : 'títulos'}`,
    hub: {
      schauspieler: { titel: 'Atores', ueberschrift: 'Rostos conhecidos', titelZeile: 'Atores: filmografia e papéis mais conhecidos | MovieMatch', beschreibung: 'Atores conhecidos com filmografia, avaliações e disponibilidade.' },
      regisseur: { titel: 'Realizadores', ueberschrift: 'Realizadores com mais títulos', titelZeile: 'Realizadores: filmografia e filmes mais conhecidos | MovieMatch', beschreibung: 'Realizadores conhecidos com filmografia, avaliações e disponibilidade.' },
    },
  },
};
