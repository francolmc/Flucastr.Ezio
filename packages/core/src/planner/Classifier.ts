import type { ModelAdapter } from '../adapters/ModelAdapter'
import { createLogger } from '../utils/Logger'

interface ClassificationResult {
  level: 'simple' | 'moderate' | 'complex'
  reason: string
}

export class Classifier {
  private logger = createLogger('Classifier')

  constructor(private adapter: ModelAdapter) {}

  async classify(message: string, sessionContext?: string, dateContext?: string): Promise<ClassificationResult> {
    const prompt = `You are a task complexity classifier.
Respond with ONLY valid JSON: {"level": "simple|moderate|complex", "reason": "..."}

DEFINITIONS:
- simple: no external tools needed. Greetings, general knowledge, conversation.
- moderate: exactly ONE tool call completes the task.
- complex: requires 2 or more tool calls in sequence.

CRITICAL RULE: Count the distinct tool calls required (0=simple, 1=moderate, 2+=complex).

ADDITIONAL CRITICAL RULES:
- 3+ numbered steps (1. 2. 3.) → always complex
- analyze/create or analyze/write = complex (2+ chained tools)
- SEARCH + CREATE/WRITE → complex
- GENERATE/CREATE/WRITE/DRAW content WITHOUT asking to save it → simple (content goes in response)
- GENERATE content AND explicitly ask to save/write/persist it (e.g. "guárdalo", "escríbelo", "créalo como .md") → moderate using write_file
- Relative date references (today, tomorrow, next week) + current status/schedule/score → needs web_search (moderate/complex)
- CURRENT officeholder/leader questions (president, CEO, champion) → moderate (needs web_search), never simple. Does NOT apply to historical questions ("first president", "who was").

EXAMPLES:
"hola" → {"level":"simple","reason":"greeting"}
"genera un poema sobre el mar" → {"level":"simple","reason":"content generation only, no persistence requested"}
"genera un diagrama y guárdalo en un .md" → {"level":"moderate","reason":"generation with persistence requested"}
"busca el clima" → {"level":"moderate","reason":"one web_search call"}
"¿Quién es el actual presidente de Chile?" → {"level":"moderate","reason":"current officeholder needs web_search"}
"1. lista archivos 2. guárdalos 3. crea carpeta" → {"level":"complex","reason":"numbered sequence of 3 steps"}
"analiza mi carpeta y crea un resumen" → {"level":"complex","reason":"analyze + create = 2+ chained tools"}
"¿quién fue el primer presidente de Chile?" → {"level":"simple","reason":"historical question, no current holder involved"}

${dateContext ? `${dateContext}\n` : ''}USER MESSAGE: ${message.slice(0, 300)}
${sessionContext ? `CONTEXT: ${sessionContext.slice(0, 200)}` : ''}

JSON response:`

    try {
      this.logger.debug('Prompt length:', prompt.length)
      const raw = await this.adapter.complete(
        [{ role: 'system', content: prompt }, { role: 'user', content: message }],
        { temperature: 0, responseFormat: 'json', maxTokens: 100, think: false }
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
        { temperature: 0, responseFormat: 'json', maxTokens: 100, think: false }
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
