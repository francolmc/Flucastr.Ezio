import type { DatabaseSync } from 'node:sqlite'

export interface LogEvent {
  ts: number
  runId: string
  subtaskId?: number
  component: string
  event: string
  level: 'info' | 'warn' | 'error'
  data: Record<string, unknown>
}

let loggingEnabled = true

export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled
}

export function isLoggingEnabled(): boolean {
  return loggingEnabled
}

export function logEvent(db: DatabaseSync | null, entry: LogEvent): void {
  if (!loggingEnabled || !db) return

  const insert = () => {
    try {
      db.prepare(
        'INSERT INTO events (ts, runId, subtaskId, component, event, level, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        entry.ts,
        entry.runId,
        entry.subtaskId ?? null,
        entry.component,
        entry.event,
        entry.level,
        JSON.stringify(entry.data)
      )
    } catch (err) {
      console.error('[EventLogger] failed to insert event:', err instanceof Error ? err.message : String(err))
    }
  }

  setTimeout(insert, 0)
}

export function generateRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
