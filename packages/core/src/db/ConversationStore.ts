import { DatabaseSync } from 'node:sqlite'
import { createLogger } from '../utils/Logger'

const logger = createLogger('ConversationStore')

export interface ConversationTurn {
  userId: string
  sessionId: string
  userMessage: string
  ezioResponse: string
  toolsUsed: string[]
  toolResults: Array<{ tool: string; result: string }>
  turnIndex: number
  timestamp: number
}

export interface ConversationSnapshot {
  userId: string
  sessionId: string
  snapshot: string
  turnsCompressed: number
  createdAt: number
}

export class ConversationStore {
  constructor(private db: DatabaseSync) {}

  saveTurn(turn: ConversationTurn): void {
    this.db.prepare(`
      INSERT INTO conversation_turns
        (user_id, session_id, user_message, ezio_response,
         tools_used, tool_results, turn_index, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      turn.userId,
      turn.sessionId,
      turn.userMessage,
      turn.ezioResponse,
      JSON.stringify(turn.toolsUsed),
      JSON.stringify(turn.toolResults),
      turn.turnIndex,
      turn.timestamp
    )
  }

  getTurns(
    userId: string,
    sessionId: string,
    limit = 20
  ): ConversationTurn[] {
    const rows = this.db.prepare(`
      SELECT user_id, session_id, user_message, ezio_response,
             tools_used, tool_results, turn_index, timestamp
      FROM conversation_turns
      WHERE user_id = ? AND session_id = ?
      ORDER BY turn_index DESC
      LIMIT ?
    `).all(userId, sessionId, limit) as Array<Record<string, unknown>>

    return rows.reverse().map(r => ({
      userId: r.user_id as string,
      sessionId: r.session_id as string,
      userMessage: r.user_message as string,
      ezioResponse: r.ezio_response as string,
      toolsUsed: JSON.parse(r.tools_used as string),
      toolResults: JSON.parse(r.tool_results as string),
      turnIndex: r.turn_index as number,
      timestamp: r.timestamp as number
    }))
  }

  getLatestSnapshot(
    userId: string,
    sessionId: string
  ): ConversationSnapshot | null {
    const row = this.db.prepare(`
      SELECT user_id, session_id, snapshot, turns_compressed, created_at
      FROM conversation_snapshots
      WHERE user_id = ? AND session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId, sessionId) as Record<string, unknown> | undefined

    if (!row) return null
    return {
      userId: row.user_id as string,
      sessionId: row.session_id as string,
      snapshot: row.snapshot as string,
      turnsCompressed: row.turns_compressed as number,
      createdAt: row.created_at as number
    }
  }

  saveSnapshot(snapshot: ConversationSnapshot): void {
    this.db.prepare(`
      INSERT INTO conversation_snapshots
        (user_id, session_id, snapshot, turns_compressed, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      snapshot.userId,
      snapshot.sessionId,
      snapshot.snapshot,
      snapshot.turnsCompressed,
      snapshot.createdAt
    )
  }

  countTurns(userId: string, sessionId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM conversation_turns
      WHERE user_id = ? AND session_id = ?
    `).get(userId, sessionId) as { count: number }
    return row.count
  }
}

export function createConversationStore(db: DatabaseSync): ConversationStore {
  return new ConversationStore(db)
}