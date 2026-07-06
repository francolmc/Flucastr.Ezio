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

    const prompt = `Classify the complexity of the user request.

USER MESSAGE: ${message}
${sessionContext ? `CONTEXT:\n${sessionContext}` : ''}

LEVELS:
- SIMPLE: No external tools needed. Only for: greetings, general knowledge 
  questions answerable from memory, casual conversation, confirmations.
- MODERATE: Exactly ONE external tool call needed.
- COMPLEX: 2 or more tool calls where result of step N feeds into step N+1.

CRITICAL RULES — these override everything else:
- ANY question about files, folders, directories, or file contents = MODERATE minimum
- ANY question about current system state = MODERATE minimum  
- ANY request to read, list, search, create, or modify files = MODERATE minimum
- "show me", "list", "what's in", "contents of" + any folder/file = MODERATE
- Only classify as SIMPLE if the answer requires NO external data whatsoever
- When in doubt between SIMPLE and MODERATE: choose MODERATE

Examples:
- "hola" → SIMPLE
- "what is Python?" → SIMPLE  
- "list my Downloads folder" → MODERATE
- "show me Documents" → MODERATE
- "what files do I have?" → MODERATE
- "search for X and create a file with results" → COMPLEX

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
