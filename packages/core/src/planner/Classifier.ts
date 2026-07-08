import type { ModelAdapter } from '../adapters/ModelAdapter'
import { createLogger } from '../utils/Logger'

interface ClassificationResult {
  level: 'simple' | 'moderate' | 'complex'
  reason: string
}

export class Classifier {
  private logger = createLogger('Classifier')

  constructor(private adapter: ModelAdapter) {}

  async classify(message: string, sessionContext?: string): Promise<ClassificationResult> {
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

    try {
      const raw = await this.adapter.complete(
        [{ role: 'system', content: prompt }, { role: 'user', content: message }],
        { temperature: 0 }
      )
      this.logger.debug('Raw response:', raw.slice(0, 200))

      const result = this.parseClassification(raw)
      if (result) return result

      this.logger.warn('First parse failed, retrying with minimal prompt')
      const retryPrompt = `Reply with ONLY valid JSON, nothing else.
{"level": "simple|moderate|complex", "reason": "why"}

Rules:
- simple: no tools needed (greetings, knowledge questions)
- moderate: one tool call needed
- complex: 2+ chained tool calls

Message: ${message.slice(0, 200)}`

      const retryRaw = await this.adapter.complete(
        [{ role: 'user', content: retryPrompt }],
        { temperature: 0 }
      )
      this.logger.debug('Retry response:', retryRaw.slice(0, 200))

      const retryResult = this.parseClassification(retryRaw)
      if (retryResult) return retryResult

      this.logger.warn('Both attempts failed, defaulting to simple')
      return { level: 'simple', reason: 'parse error, defaulting to simple' }

    } catch (e) {
      this.logger.warn('Classification error:', e instanceof Error ? e.message : String(e))
      return { level: 'simple', reason: 'error, defaulting to simple' }
    }
  }

  private parseClassification(raw: string): ClassificationResult | null {
    try {
      let depth = 0, start = -1
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') { if (depth === 0) start = i; depth++ }
        else if (raw[i] === '}') {
          depth--
          if (depth === 0 && start !== -1) {
            const candidate = raw.slice(start, i + 1)
            const parsed = JSON.parse(candidate)
            const level = parsed.level?.toLowerCase()
            if (['simple', 'moderate', 'complex'].includes(level)) {
              return { level, reason: parsed.reason ?? '' }
            }
          }
        }
      }
    } catch { }
    return null
  }
}
