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
    const prompt = `You are a task complexity classifier.
Respond with ONLY valid JSON: {"level": "simple|moderate|complex", "reason": "..."}

DEFINITIONS:
- simple: no external tools needed. Greetings, general knowledge, conversation.
- moderate: exactly ONE tool call completes the task.
- complex: requires 2 or more tool calls in sequence.

CRITICAL RULE: Count the number of distinct tool calls required.
- 0 tool calls → simple
- 1 tool call → moderate
- 2+ tool calls → complex

ADDITIONAL RULE:
If the message contains 3 or more distinct action verbs that each require a different tool, classify as complex.
Examples of action verbs: lista, crea, mueve, guarda, busca, escribe, elimina, list, create, move, save, search.

EXAMPLES:
"hola" → {"level":"simple","reason":"greeting"}
"busca el clima" → {"level":"moderate","reason":"one web_search call"}
"lista mis archivos" → {"level":"moderate","reason":"one list_directory call"}
"busca X y crea un archivo con el resultado" → {"level":"complex","reason":"web_search then write_file"}
"lista Downloads, crea carpetas y mueve archivos" → {"level":"complex","reason":"list_directory + create_directory x4 + move_file xN"}
"organiza archivos en subcarpetas" → {"level":"complex","reason":"requires listing, creating dirs, and moving multiple files"}

USER MESSAGE: ${message.slice(0, 300)}
${sessionContext ? `CONTEXT: ${sessionContext.slice(0, 200)}` : ''}

JSON response:`

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
