CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  runId TEXT NOT NULL,
  subtaskId INTEGER,
  component TEXT NOT NULL,
  event TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_runId ON events(runId);
CREATE INDEX IF NOT EXISTS idx_events_component_event ON events(component, event);
