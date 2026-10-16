-- Coach IA intégré (Workers AI) : quota quotidien par athlète et instantanés pour « Annuler ».
CREATE TABLE ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ai_runs_user ON ai_runs(user_id, created_at);
