CREATE TABLE IF NOT EXISTS conversation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  turns_compressed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_session
  ON conversation_snapshots(user_id, session_id);
