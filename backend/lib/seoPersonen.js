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
};
