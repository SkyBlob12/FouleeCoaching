-- Détails Strava (tours, meilleurs efforts) des sorties récentes : même règle de cache 7 jours.
CREATE TABLE activity_detail_cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, strava_id)
);
