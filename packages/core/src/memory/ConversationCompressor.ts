import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { ConversationStore } from '../db/ConversationStore'
import { createLogger } from '../utils/Logger'

const logger = createLogger('Compressor')

export interface ConversationStateSnapshot {
  user_goal: string
  completed: string[]
  established_facts: string[]
  pending: string
  last_tool_results: Record<string, string>
}

export class ConversationCompressor {
  constructor(
    private adapter: ModelAdapter,
    private store: ConversationStore
  ) {}

  async compress(
    userId: string,
    sessionId: string,
    history: Array<{ role: string; content: string }>
  ): Promise<string | null> {
    if (history.length === 0) return null

    const historyText = history
      .map(m => `${m.role === 'user' ? 'User' : 'Ezio'}: ${m.content}`)
      .join('\n')

    const prompt = `Analyze this conversation and produce a JSON state snapshot.
Be factual — only include what was explicitly said or done.
Mark anything uncertain as UNVERIFIED.
Do not invent actions or results.

CONVERSATION:
${historyText.slice(0, 4000)}

Respond ONLY with valid JSON matching this exact schema:
{
  "user_goal": "main objective of the user in this session",
  "completed": ["action 1 completed", "action 2 completed"],
  "established_facts": ["key fact 1", "key fact 2"],
  "pending": "what remains unresolved, or empty string if done",
  "last_tool_results": {"tool_name": "one-line result summary"}
}`

    try {
      const raw = await this.adapter.complete(
        [{ role: 'user', content: prompt }],
        { temperature: 0 }
      )

      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) {
        logger.warn('Could not parse snapshot JSON — keeping last 4 turns')
        return null
      }

      const snapshot: ConversationStateSnapshot = JSON.parse(match[0])

      if (typeof snapshot.user_goal !== 'string') {
        logger.warn('Invalid snapshot schema — keeping last 4 turns')
        return null
      }

      this.store.saveSnapshot({
        userId,
        sessionId,
        snapshot: JSON.stringify(snapshot),
        turnsCompressed: history.length,
        createdAt: Date.now()
      })

      logger.info(`Compressed ${history.length} turns into snapshot`)
      return JSON.stringify(snapshot)

    } catch (e) {
      logger.warn('Compression failed:', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  formatSnapshotForContext(snapshotJson: string): string {
    try {
      const s: ConversationStateSnapshot = JSON.parse(snapshotJson)
      const parts = [`[CONVERSATION_SUMMARY]`]

      if (s.user_goal) parts.push(`Goal: ${s.user_goal}`)
      if (s.completed?.length) parts.push(`Completed:\n${s.completed.map(c => `- ${c}`).join('\n')}`)
      if (s.established_facts?.length) parts.push(`Facts:\n${s.established_facts.map(f => `- ${f}`).join('\n')}`)
      if (s.pending) parts.push(`Pending: ${s.pending}`)
      if (Object.keys(s.last_tool_results ?? {}).length) {
        const results = Object.entries(s.last_tool_results)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')
        parts.push(`Last results:\n${results}`)
      }

      parts.push(`[/CONVERSATION_SUMMARY]`)
      return parts.join('\n')
    } catch {
      return snapshotJson
    }
  }
}

export function createConversationCompressor(
  adapter: ModelAdapter,
  store: ConversationStore
): ConversationCompressor {
  return new ConversationCompressor(adapter, store)
}
