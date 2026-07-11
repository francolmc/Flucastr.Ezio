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

CRITICAL RULE: Count the number of distinct tool calls required.
- 0 tool calls → simple
- 1 tool call → moderate
- 2+ tool calls → complex

ADDITIONAL CRITICAL RULES:
- If the message contains 3 or more numbered steps (1. 2. 3.) → ALWAYS classify as complex, no exceptions
- If the message contains words like "analiza", "analyze", "luego", "then", "después", "finally", "finalmente" combined with any file operation → complex
- If the message asks to both SEARCH and CREATE/WRITE → always complex (minimum 2 chained tool calls)
- If the message asks to GENERATE, CREATE, WRITE, or DRAW content (diagrams, code, poems, summaries, explanations, queries, tables, etc.) WITHOUT explicitly asking to save/write/persist it to a file, disk, or specific location → simple (the content goes directly in the response, no tool needed to "produce" it)
- If the message ALSO explicitly asks to save/write/persist that generated content (e.g. "guárdalo en un archivo", "escríbelo en mi escritorio", "créalo como .md") → moderate/complex as normal, using write_file
- If the message references a relative date (today, tomorrow, next week) or a specific date/event and asks about its current status, schedule, score, or outcome — treat it as needing a live web_search (moderate, or complex if combined with other actions) even if it superficially resembles a general-knowledge question. Use the provided current date to determine whether the referenced event is past, present, or future.
- If the message asks about the CURRENT holder of a position, role, or title (president, CEO, champion, current leader, etc.) — even if it sounds like simple trivia — classify as moderate (needs a web_search), never simple. These facts change over time and the model's training data may be stale relative to the current date provided. This applies regardless of how confident the model might feel. Do NOT apply this rule to historical questions (e.g. "who was the first president").

EXAMPLES:
"genera un diagrama de secuencia en mermaid" → {"level":"simple","reason":"content generation only, no persistence requested"}
"escribe un poema sobre el mar" → {"level":"simple","reason":"content generation only"}
"dame un ejemplo de query SQL para esto" → {"level":"simple","reason":"content generation only"}
"genera un diagrama en mermaid y guárdalo en un archivo .md" → {"level":"moderate","reason":"one write_file call after generating content"}
"escribe un resumen del proyecto y déjalo en mi escritorio" → {"level":"moderate","reason":"one write_file call"}
"busca los zip, guárdalos, crea carpeta, escribe informe" → {"level":"complex","reason":"multiple chained operations"}
"1. list files 2. save to memory 3. create folder" → {"level":"complex","reason":"numbered sequence of 3 steps"}
"analiza mi carpeta y crea un resumen" → {"level":"complex","reason":"analyze + create/write = 2+ chained tools"}
"hola" → {"level":"simple","reason":"greeting"}
"busca el clima" → {"level":"moderate","reason":"one web_search call"}
"lista mis archivos" → {"level":"moderate","reason":"one list_directory call"}
"que hora juega mañana Argentina en el mundial" → {"level":"moderate","reason":"references a relative future date, needs a live web_search for the current schedule"}
"¿Quién es el actual presidente de Chile?" → {"level":"moderate","reason":"current officeholder question, needs verification via web_search regardless of apparent confidence"}
"¿quién fue el primer presidente de Chile?" → {"level":"simple","reason":"historical question, no current holder involved"}

${dateContext ? `${dateContext}\n` : ''}USER MESSAGE: ${message.slice(0, 300)}
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
