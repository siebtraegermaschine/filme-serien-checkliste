// Herkunftsland, Originalsprache, Laufzeit und Staffelzahl aus einer TMDB-
// Detailantwort. Reine Funktion, geteilt von Backfill-Skript und Discovery-Import.
export function merkmaleAusDetail(detail, kind) {
  const d = detail || {};
  const codes = (liste) => (Array.isArray(liste) ? liste : []).filter((c) => /^[A-Z]{2}$/.test(c));
  // Serien liefern origin_country, bei Filmen fehlt es teils -> Produktionslaender.
  let land = codes(d.origin_country);
  if (!land.length) land = codes((d.production_countries || []).map((p) => p && p.iso_3166_1));
  const sprache = /^[a-z]{2,3}$/.test(d.original_language || '') ? d.original_language : null;
  const positiv = (n) => (Number.isInteger(n) && n > 0 ? n : null);
  return {
    originCountry: land.length ? land : null,
    originalLanguage: sprache,
    // Serien: Minuten je Folge (episode_run_time ist bei TMDB oft leer, dann
    // zaehlt die zuletzt gesendete Folge).
    runtime: kind === 'movie' ? positiv(d.runtime)
      : positiv((d.episode_run_time || [])[0]) || positiv(d.last_episode_to_air && d.last_episode_to_air.runtime),
    seasons: kind === 'movie' ? null : positiv(d.number_of_seasons),
  };
}
