// TMDB-Titel und -Inhaltsangaben von Zeichen bereinigen, die dort versehentlich
// stehen (z. B. U+A789 statt ":" bei den spanischen Dragon-Ball-Titeln).
// Bindestriche bleiben unberuehrt: "Spider-Man" ist richtig, Einzelfaelle per SQL.
export function tmdbText(s) {
  return String(s || '')
    .replace(/[꞉：]/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}
