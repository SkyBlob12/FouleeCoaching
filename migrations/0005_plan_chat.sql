-- Discussion avec le coach IA pour modifier le plan : un fil par plan.
CREATE TABLE plan_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- réponse du coach : { changes: string[], runId: number | null }
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX plan_chat_plan ON plan_chat(plan_id, id);
CREATE INDEX plan_chat_user ON plan_chat(user_id, created_at);
