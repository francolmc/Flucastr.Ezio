import { DatabaseSync } from 'node:sqlite'
import { createLogger } from '../utils/Logger'

const logger = createLogger('FactsStore')

export const CANONICAL_KEYS = [
  'name', 'city', 'country', 'profession', 'employer',
  'projects', 'preferences', 'family', 'pets',
  'language', 'timezone', 'notes'
] as const

export type FactKey = typeof CANONICAL_KEYS[number]

export interface Fact {
  key: string
  value: string
  importance?: number
  accessCount?: number
  lastAccessedAt?: number | null
}

export class FactsStore {
  constructor(private db: DatabaseSync) {}

  saveFact(
    userId: string,
    key: string,
    value: string,
    importance = 0.5
  ): void {
    this.db.prepare(`
      INSERT INTO facts (user_id, key, value, importance, access_count, updated_at)
      VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        importance = excluded.importance,
        updated_at = excluded.updated_at
    `).run(userId, key, value, importance, Date.now())
    logger.debug(`Saved fact: ${key}=${value} (importance=${importance})`)
  }

  buildMemoryBlock(userId: string): Fact[] {
    const now = Date.now()
    const rows = this.db.prepare(`
      SELECT key, value, importance, access_count, last_accessed_at, updated_at
      FROM facts
      WHERE user_id = ? AND importance > 0
    `).all(userId) as Array<{
      key: string
      value: string
      importance: number
      access_count: number
      last_accessed_at: number | null
      updated_at: number
    }>

    const scored = rows.map(row => {
      const daysSince = (now - row.updated_at) / (1000 * 60 * 60 * 24)
      const recency = 1.0 / (1 + daysSince)
      return {
        ...row,
        score: row.importance * recency
      }
    })

    scored.sort((a, b) => b.score - a.score)
    const top10 = scored.slice(0, 10)

    if (top10.length > 0) {
      const keys = top10.map(f => f.key)
      const placeholders = keys.map(() => '?').join(',')
      this.db.prepare(`
        UPDATE facts
        SET access_count = access_count + 1, last_accessed_at = ?
        WHERE user_id = ? AND key IN (${placeholders})
      `).run(now, userId, ...keys)
    }

    return top10.map(f => ({
      key: f.key,
      value: f.value,
      importance: f.importance,
      accessCount: f.access_count,
      lastAccessedAt: f.last_accessed_at
    }))
  }

  archiveFact(userId: string, key: string): void {
    this.db.prepare(`
      UPDATE facts SET importance = 0.0 WHERE user_id = ? AND key = ?
    `).run(userId, key)
    logger.debug(`Archived fact: ${key}`)
  }

  getAllFacts(userId: string): Fact[] {
    return this.db.prepare(`
      SELECT key, value, importance, access_count, last_accessed_at
      FROM facts WHERE user_id = ? AND importance > 0
      ORDER BY importance DESC
    `).all(userId) as Fact[]
  }
}

export function createFactsStore(db: DatabaseSync): FactsStore {
  return new FactsStore(db)
}