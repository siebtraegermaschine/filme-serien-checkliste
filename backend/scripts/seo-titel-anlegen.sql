-- Legt fuer Streaming-Titel ohne Eintrag in titles eine reine SEO-Zeile an
-- (source='seo'). Die App-Liste fragt source explizit ab, der Katalog waechst
-- dadurch nicht. Aufruf: psql -v regionen="'DE','AT','CH','FR','GB','US','CA'" -f ...
-- Titel: erst deutsche Region, sonst die erste vorhandene; title_en und overview_en
-- aus GB/US/CA, plot nur aus DE/AT/CH (sonst stuende fremdsprachiger Text auf de-Seiten).
WITH kand AS (
  SELECT DISTINCT ON (s.type, s.tmdb_id)
         s.type, s.tmdb_id, s.title, s.year, s.genres, s.director, s.cast_names,
         s.poster_path, s.rating, s.overview, s.region
    FROM streaming_cache s
   WHERE s.region IN (:regionen)
     AND NOT EXISTS (SELECT 1 FROM titles t WHERE t.type = s.type AND t.tmdb_id = s.tmdb_id)
     AND NOT EXISTS (SELECT 1 FROM title_tmdb_resolution r JOIN titles t ON t.id = r.title_id
                      WHERE r.tmdb_id = s.tmdb_id AND t.type = s.type)
   ORDER BY s.type, s.tmdb_id,
            array_position(ARRAY['DE','AT','CH','GB','US','CA','FR'], s.region), s.fetched_at DESC
), en AS (
  SELECT DISTINCT ON (type, tmdb_id) type, tmdb_id, title, overview
    FROM streaming_cache WHERE region IN ('GB','US','CA')
   ORDER BY type, tmdb_id, array_position(ARRAY['GB','US','CA'], region)
), de AS (
  SELECT DISTINCT ON (type, tmdb_id) type, tmdb_id, overview
    FROM streaming_cache WHERE region IN ('DE','AT','CH') AND length(overview) > 30
   ORDER BY type, tmdb_id, array_position(ARRAY['DE','AT','CH'], region)
)
INSERT INTO titles (tmdb_id, type, title, title_en, year, genres, director, cast_names,
                    poster_path, rating, plot, overview_en, source)
SELECT k.tmdb_id, k.type, k.title, e.title, k.year, k.genres, k.director, k.cast_names,
       k.poster_path, k.rating, d.overview, e.overview, 'seo'
  FROM kand k LEFT JOIN en e ON e.type = k.type AND e.tmdb_id = k.tmdb_id
  LEFT JOIN de d ON d.type = k.type AND d.tmdb_id = k.tmdb_id
ON CONFLICT DO NOTHING;
