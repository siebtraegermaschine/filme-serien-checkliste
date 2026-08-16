// Eine Slug-Funktion fuer alle SEO-Seitenarten (Titel/Genre/Anbieter/Stadt) --
// siehe PLAN-SEO.md Abschnitt 3. Deutsch orientiert (Umlaute/scharfes S
// transkribiert), weil der Startumfang nur de-de ist.
const UMLAUTE = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => UMLAUTE[z])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
