-- Le fil du coach existe aussi sans plan actif (séances sur mesure seules) : plan_id devient facultatif.
CREATE TABLE plan_chat_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- réponse du coach : { changes: string[], runId: number | null }
  data TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO plan_chat_new (id, user_id, plan_id, role, content, data, created_at)
  SELECT id, user_id, plan_id, role, content, data, created_at FROM plan_chat;
DROP TABLE plan_chat;
ALTER TABLE plan_chat_new RENAME TO plan_chat;
CREATE INDEX plan_chat_plan ON plan_chat(plan_id, id);
CREATE INDEX plan_chat_user ON plan_chat(user_id, created_at);
