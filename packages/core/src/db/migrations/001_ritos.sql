CREATE TABLE IF NOT EXISTS ritos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  objective_text TEXT NOT NULL,
  plan_summary TEXT NOT NULL DEFAULT '',
  tools_used TEXT NOT NULL DEFAULT '[]',
  result_summary TEXT NOT NULL DEFAULT '',
  guia TEXT NOT NULL DEFAULT '',
  uso_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
