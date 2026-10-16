-- Ressentis saisis par l'athlète après chaque séance (donnée de l'athlète, pas de Strava).
CREATE TABLE session_feedback (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, session_key)
);
CREATE INDEX session_feedback_date ON session_feedback(user_id, date);

-- Notes laissées par le coach IA (Claude via le connecteur MCP).
CREATE TABLE coach_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Jeton secret du connecteur Claude (URL personnelle, révocable).
ALTER TABLE users ADD COLUMN mcp_token TEXT;
CREATE UNIQUE INDEX users_mcp_token ON users(mcp_token);
