import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { ChatMessage } from '../adapters/ModelAdapter'

interface ClassificationResult {
  level: 'simple' | 'moderate' | 'complex'
  reason: string
}

export class Classifier {
  constructor(private adapter: ModelAdapter) {}

  async classify(message: string, sessionContext?: string): Promise<ClassificationResult> {
    const contextSection = sessionContext
      ? `\nCONTEXT:\n${sessionContext}`
      : ''

    const prompt = `Classify the user request complexity level.

USER MESSAGE: ${message}${contextSection}

LEVELS:
- SIMPLE: no external actions needed. Conversation, general knowledge, confirmations, greetings.
- MODERATE: exactly ONE external tool call will complete the task. The tool output directly answers the request.
- COMPLEX: 2 or more tool calls where the result of step N is required input for step N+1.

Rules:
- Default to SIMPLE when uncertain between SIMPLE and MODERATE
- Default to COMPLEX when uncertain between MODERATE and COMPLEX
- Only count actions that require external tools

Respond with ONLY valid JSON:
{"level": "simple|moderate|complex", "reason": "brief explanation"}`

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

    try {
      const response = await this.adapter.complete(messages)
      const parsed = this.parseResponse(response)

      if (parsed) {
        return parsed
      }

      console.warn('[Classifier] Parse failed, defaulting to simple')
      return { level: 'simple', reason: 'parse error, defaulting to simple' }
    } catch (err) {
      console.warn('[Classifier] Error:', err)
      return { level: 'simple', reason: 'error, defaulting to simple' }
    }
  }

  private parseResponse(response: string): ClassificationResult | null {
    const match = response.match(/\{[^}]+\}/)
    if (!match) return null

    try {
      const parsed = JSON.parse(match[0])
      if (parsed.level !== 'simple' && parsed.level !== 'moderate' && parsed.level !== 'complex') {
        return null
      }
      return {
        level: parsed.level,
        reason: parsed.reason || ''
      }
    } catch {
      return null
    }
  }
}
