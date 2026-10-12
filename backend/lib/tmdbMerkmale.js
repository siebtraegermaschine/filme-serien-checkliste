// Herkunftsland, Originalsprache, Laufzeit, Staffelzahl und Reihe (Collection)
// aus einer TMDB-Detailantwort. Reine Funktion, geteilt von Backfill-Skripten
// und Discovery-Import.
export function merkmaleAusDetail(detail, kind) {
  const d = detail || {};
  const codes = (liste) => (Array.isArray(liste) ? liste : []).filter((c) => /^[A-Z]{2}$/.test(c));
  // Serien liefern origin_country, bei Filmen fehlt es teils -> Produktionslaender.
  let land = codes(d.origin_country);
  if (!land.length) land = codes((d.production_countries || []).map((p) => p && p.iso_3166_1));
  const sprache = /^[a-z]{2,3}$/.test(d.original_language || '') ? d.original_language : null;
  const positiv = (n) => (Number.isInteger(n) && n > 0 ? n : null);
  const istFilm = kind === 'movie';
  // Reihe nur bei Filmen und nur mit ID + Name; erschienen_am ordnet sie.
  const reihe = istFilm && d.belongs_to_collection ? d.belongs_to_collection : null;
  const reiheName = reihe && typeof reihe.name === 'string' ? reihe.name.trim() : '';
  const hatReihe = positiv(reihe && reihe.id) && reiheName;
  return {
    originCountry: land.length ? land : null,
    originalLanguage: sprache,
    // Serien: Minuten je Folge (episode_run_time ist bei TMDB oft leer, dann
    // zaehlt die zuletzt gesendete Folge).
    runtime: istFilm ? positiv(d.runtime)
      : positiv((d.episode_run_time || [])[0]) || positiv(d.last_episode_to_air && d.last_episode_to_air.runtime),
    seasons: istFilm ? null : positiv(d.number_of_seasons),
    collectionId: hatReihe ? reihe.id : null,
    collectionName: hatReihe ? reiheName : null,
    erschienenAm: istFilm && /^\d{4}-\d{2}-\d{2}$/.test(d.release_date || '') ? d.release_date : null,
  };
}
