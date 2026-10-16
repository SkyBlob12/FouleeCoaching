CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strava_id INTEGER UNIQUE,
  firstname TEXT NOT NULL DEFAULT '',
  lastname TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Données saisies par l'athlète (jamais issues de Strava) : conservées sans limite.
CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX plans_user ON plans(user_id, active);

CREATE TABLE custom_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX custom_sessions_user ON custom_sessions(user_id, date);

-- Cache Strava : purgé au-delà de 7 jours (règles de l'API Strava).
CREATE TABLE activity_cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, strava_id)
);

CREATE TABLE sync_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_sync INTEGER NOT NULL
);
