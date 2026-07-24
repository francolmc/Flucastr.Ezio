import type { ModelAdapter, ChatMessage } from '@ezio/core'
import { createLogger } from '@ezio/core'
import type { AnthropicToolSchema } from './types.js'
import { extractCompletedSteps, formatPlanState } from './planState.js'

const logger = createLogger('FormVerifier')

export interface ToolProposal {
  name: string
  input: Record<string, unknown>
}

export interface FormVerifierResult {
  approved: boolean
  reason: string
  costLLM: boolean
  failureType?: 'schema' | 'quantity' | 'coherence_needs_step' | 'coherence_redundant'
  quantityDetails?: { actualWords: number; requiredWords: number; textFieldKey?: string }
  suggestion?: string
}

export class FormVerifier {
  constructor(private adapter: ModelAdapter) { }

  checkSchema(proposal: ToolProposal, declaredTools: AnthropicToolSchema[]): FormVerifierResult {
    logger.debug(`checkSchema: tool=${proposal.name}`)
    const tool = declaredTools.find(t => t.name === proposal.name)

    if (!tool) {
      return {
        approved: false,
        reason: `tool "${proposal.name}" no existe en el schema declarado`,
        costLLM: false
      }
    }

    const required = tool.input_schema.required ?? []
    for (const field of required) {
      if (!(field in proposal.input)) {
        return {
          approved: false,
          reason: `falta campo requerido "${field}"`,
          costLLM: false
        }
      }
    }

    const properties = tool.input_schema.properties
    for (const [key, value] of Object.entries(proposal.input)) {
      const schema = properties[key]
      if (!schema) continue
      const expectedType = schema.type
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (expectedType === 'array' || expectedType === 'object') {
        continue
      }
      if (expectedType === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return {
            approved: false,
            reason: `tipo incorrecto para "${key}": se recibió ${actualType}, se espera integer`,
            costLLM: false
          }
        }
        continue
      }
      if (actualType !== expectedType) {
        return {
          approved: false,
          reason: `tipo incorrecto para "${key}": se recibió ${actualType}, se espera ${expectedType}`,
          costLLM: false
        }
      }
    }

    return { approved: true, reason: 'schema válido', costLLM: false }
  }

  checkQuantityRequirements(proposal: ToolProposal, lastUserTurn: string): FormVerifierResult {
    const wordCountMatch = lastUserTurn.match(/(?:al menos|mínimo|minimo|at least|no less than|minimum of)\s+(\d+)\s+(?:palabras|words)/i)
    if (!wordCountMatch) {
      return { approved: true, reason: 'sin requisito de cantidad detectado', costLLM: false }
    }

    const minWords = parseInt(wordCountMatch[1], 10)
    const textEntries = Object.entries(proposal.input).filter((e): e is [string, string] => typeof e[1] === 'string')

    if (textEntries.length === 0) {
      return { approved: true, reason: 'no hay campo de texto para verificar cantidad', costLLM: false }
    }

    const [longestKey, longestText] = textEntries.reduce((a, b) => (b[1].length > a[1].length ? b : a))
    const wordCount = longestText.trim().split(/\s+/).filter(Boolean).length

    if (wordCount < minWords) {
      return {
        approved: false,
        reason: `el contenido tiene ${wordCount} palabras, se requieren al menos ${minWords}`,
        costLLM: false,
        failureType: 'quantity',
        quantityDetails: { actualWords: wordCount, requiredWords: minWords, textFieldKey: longestKey }
      }
    }

    return { approved: true, reason: `cantidad de palabras verificada: ${wordCount} >= ${minWords}`, costLLM: false }
  }

  private parseAnswer(response: string): 'YES' | 'NO' | null {
    const lines = response.split('\n').map(l => l.trim()).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].toUpperCase().match(/(?:ANSWER:?\s*)?\*{0,2}\b(YES|NO)\b\*{0,2}\.?$/)
      if (match) return match[1] as 'YES' | 'NO'
    }
    const firstLine = lines[0]?.toUpperCase() ?? ''
    if (firstLine.startsWith('YES')) return 'YES'
    if (firstLine.startsWith('NO')) return 'NO'
    return null
  }

  private parseCategory(response: string): { category: 'NEEDS_STEP' | 'REDUNDANT'; suggestion?: string } | null {
    const lines = response.split('\n').map(l => l.trim()).filter(Boolean)
    let category: 'NEEDS_STEP' | 'REDUNDANT' | null = null
    let suggestion: string | undefined

    for (let i = lines.length - 1; i >= 0; i--) {
      const upperLine = lines[i].toUpperCase()
      const categoryMatch = upperLine.match(/^CATEGORY:\s*(NEEDS_STEP|REDUNDANT)$/)
      if (categoryMatch) {
        category = categoryMatch[1] as 'NEEDS_STEP' | 'REDUNDANT'
      }
      const suggestionMatch = lines[i].match(/^SUGGESTION:\s*(.+)$/i)
      if (suggestionMatch) {
        suggestion = suggestionMatch[1]
      }
    }

    if (category === null) return null
    return { category, suggestion }
  }

  async checkCoherence(proposal: ToolProposal, lastUserTurn: string, conversationHistory: string, numCtx?: number, messages?: ChatMessage[]): Promise<FormVerifierResult> {
    logger.debug(`checkCoherence: tool=${proposal.name}`)
    const planStateBlock = messages ? formatPlanState(extractCompletedSteps(messages)) : ''
    const prompt = `User's original request: "${lastUserTurn}"

Conversation so far:
${conversationHistory}

(Some previous assistant responses are omitted above and replaced with a placeholder — this is intentional, to avoid biasing this judgment with prior conclusions. Base your answer only on what tool calls were actually executed, shown in the history, and on the user's request below — not on any previous assistant claim that a task was already finished.)

${planStateBlock ? planStateBlock + '\n\n' : ''}Proposed next tool call: ${proposal.name}(${JSON.stringify(proposal.input)})

Given what has already happened in this conversation, is this proposed call a reasonable next step toward completing the user's request? It does not need to fully resolve the request by itself — only to be sensible given what's already been done. If the user's request has multiple distinct parts and this proposal correctly addresses the next part that is still missing — even if it's the very first action taken, like creating a file that doesn't exist yet — that is a valid YES, not a rejection.

First, in one short sentence, explain your reasoning. Then on a new final line, answer exactly YES or NO.

If your answer is NO, add two more lines after that:
- CATEGORY: NEEDS_STEP (if the proposed action is premature because a prior intermediate step should be done first, e.g., reading an EXISTING file before overwriting it — this does not apply to creating a new file that doesn't exist yet)
- CATEGORY: REDUNDANT (if the user's request is already resolved and the proposed action adds nothing new, e.g., repeating a glob/list that was already done)

After the CATEGORY line, if applicable, add:
SUGGESTION: <one sentence with the concrete next step the model should propose instead>

Example of a NO response (existing file, needs a prior read step):
The file already exists and hasn't been read yet, so we can't overwrite it safely without knowing its current contents.
NO
CATEGORY: NEEDS_STEP
SUGGESTION: Read the file first to see its current contents before modifying it.

Example of a YES response (first step of a multi-part request, file does not exist yet):
The file doesn't exist yet, so creating it now is the correct first step toward the user's multi-part request.
YES`

    const response = await this.adapter.complete([
      { role: 'user', content: prompt }
    ], { temperature: 0, think: false, numCtx })

    const answer = this.parseAnswer(response)
    if (answer === 'YES') {
      return { approved: true, reason: response, costLLM: true }
    }
    if (answer === 'NO') {
      const firstLine = response.split('\n').map(l => l.trim()).filter(Boolean)[0] ?? response
      const parsed = this.parseCategory(response)
      const failureType = parsed?.category === 'REDUNDANT' ? 'coherence_redundant' : 'coherence_needs_step'
      return {
        approved: false,
        reason: firstLine,
        costLLM: true,
        failureType,
        suggestion: parsed?.suggestion
      }
    }
    return {
      approved: false,
      reason: `respuesta ambigua del verificador de coherencia, tratada como rechazo: ${response.slice(0, 200)}`,
      costLLM: true
    }
  }

  async verify(
    proposal: ToolProposal,
    declaredTools: AnthropicToolSchema[],
    lastUserTurn: string,
    conversationHistory: string,
    numCtx?: number,
    messages?: ChatMessage[]
  ): Promise<FormVerifierResult> {
    const schemaResult = this.checkSchema(proposal, declaredTools)
    if (!schemaResult.approved) {
      return schemaResult
    }

    const quantityResult = this.checkQuantityRequirements(proposal, lastUserTurn)
    if (!quantityResult.approved) {
      return quantityResult
    }

    return this.checkCoherence(proposal, lastUserTurn, conversationHistory, numCtx, messages)
  }
}
