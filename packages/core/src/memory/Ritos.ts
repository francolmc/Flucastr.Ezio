import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export interface Rito {
  id: string
  userId: string
  objectiveText: string
  planSummary: string
  toolsUsed: string[]
  resultSummary: string
  guia: string
  usoCount: number
  createdAt: number
  updatedAt: number
}

export interface RitoMatch {
  rito: Rito
  similarity: number
}

function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = s.toLowerCase().split(/[\s\p{P}]+/u)
    return new Set(tokens.filter((t) => t.length > 1))
  }

  const setA = tokenize(a)
  const setB = tokenize(b)

  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  const intersection = new Set([...setA].filter((t) => setB.has(t)))
  const union = new Set([...setA, ...setB])

  return intersection.size / union.size
}

export class RitosService {
  constructor(private db: DatabaseSync) {}

  async saveRito(
    userId: string,
    objectiveText: string,
    toolsUsed: string[],
    resultSummary: string,
    guia: string
  ): Promise<void> {
    const id = randomUUID()
    const now = Date.now()

    this.db.exec(
      `INSERT OR IGNORE INTO ritos (id, user_id, objective_text, plan_summary, tools_used, result_summary, guia, uso_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      userId,
      objectiveText,
      '',
      JSON.stringify(toolsUsed),
      resultSummary,
      guia,
      now,
      now
    )
  }

  findRito(userId: string, objective: string, threshold = 0.6): RitoMatch | null {
    const stmt = this.db.prepare('SELECT * FROM ritos WHERE user_id = ?')
    const rows = stmt.all(userId) as RitoRow[]

    let bestMatch: RitoMatch | null = null

    for (const row of rows) {
      const similarity = jaccardSimilarity(objective, row.objective_text)

      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = {
            rito: {
              id: row.id,
              userId: row.user_id,
              objectiveText: row.objective_text,
              planSummary: row.plan_summary,
              toolsUsed: JSON.parse(row.tools_used),
              resultSummary: row.result_summary,
              guia: row.guia,
              usoCount: row.uso_count,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
            similarity,
          }
        }
      }
    }

    if (bestMatch) {
      this.incrementUsage(bestMatch.rito.id)
    }

    return bestMatch
  }

  private incrementUsage(id: string): void {
    const now = Date.now()
    this.db.exec('UPDATE ritos SET uso_count = uso_count + 1, updated_at = ? WHERE id = ?', now, id)
  }
}

interface RitoRow {
  id: string
  user_id: string
  objective_text: string
  plan_summary: string
  tools_used: string
  result_summary: string
  guia: string
  uso_count: number
  created_at: number
  updated_at: number
}

export function createRitosService(db: DatabaseSync): RitosService {
  return new RitosService(db)
}
