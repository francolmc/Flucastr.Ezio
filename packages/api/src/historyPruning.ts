import type { ModelAdapter, ChatMessage } from '@ezio/core'
import { createLogger } from '@ezio/core'

const logger = createLogger('HistoryPruning')

export interface PruneResult {
  messages: ChatMessage[]
  summary: string | null
}

export interface PruneOptions {
  pruneThreshold?: number
  keepLastTurns?: number
}

async function buildCompressionPrompt(olderMessages: ChatMessage[]): Promise<string> {
  const historyText = olderMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Ezio'}: ${m.content}`)
    .join('\n')

  return `Analyze this conversation and produce a JSON state snapshot.
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
  "last_tool_results": {"tool_name": "one-line result summary"}`
}

interface ConversationStateSnapshot {
  user_goal: string
  completed: string[]
  established_facts: string[]
  pending: string
  last_tool_results: Record<string, string>
}

function formatSnapshotForContext(snapshotJson: string): string {
  try {
    const s: ConversationStateSnapshot = JSON.parse(snapshotJson)
    const parts = ['[CONVERSATION_SUMMARY]']

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

    parts.push('[/CONVERSATION_SUMMARY]')
    return parts.join('\n')
  } catch {
    return snapshotJson
  }
}

export async function pruneHistory(
  adapter: ModelAdapter,
  messages: ChatMessage[],
  options?: PruneOptions
): Promise<PruneResult> {
  const pruneThreshold = options?.pruneThreshold ?? 8
  const keepLastTurns = options?.keepLastTurns ?? 4

  if (messages.length <= pruneThreshold) {
    return { messages, summary: null }
  }

  const olderMessages = messages.slice(0, -keepLastTurns)
  const recentMessages = messages.slice(-keepLastTurns)

  const prompt = await buildCompressionPrompt(olderMessages)

  try {
    const raw = await adapter.complete([{ role: 'user', content: prompt }], { temperature: 0, responseFormat: 'json', think: false, maxTokens: 300 })

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      logger.warn('No se pudo comprimir, manteniendo últimos N turnos crudos')
      return { messages: recentMessages, summary: null }
    }

    const snapshot: ConversationStateSnapshot = JSON.parse(match[0])

    if (typeof snapshot.user_goal !== 'string') {
      logger.warn('No se pudo comprimir, manteniendo últimos N turnos crudos')
      return { messages: recentMessages, summary: null }
    }

    const summary = formatSnapshotForContext(JSON.stringify(snapshot))
    return { messages: recentMessages, summary }
  } catch (e) {
    logger.warn('No se pudo comprimir, manteniendo últimos N turnos crudos')
    return { messages: recentMessages, summary: null }
  }
}
