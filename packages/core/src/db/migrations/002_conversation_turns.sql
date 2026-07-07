CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  ezio_response TEXT NOT NULL,
  tools_used TEXT NOT NULL DEFAULT '[]',
  tool_results TEXT NOT NULL DEFAULT '[]',
  turn_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_user_session
  ON conversation_turns(user_id, session_id);
