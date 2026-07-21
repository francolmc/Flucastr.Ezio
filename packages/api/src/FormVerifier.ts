import type { ModelAdapter } from '@ezio/core'
import { createLogger } from '@ezio/core'
import type { AnthropicToolSchema } from './types.js'

const logger = createLogger('FormVerifier')

export interface ToolProposal {
  name: string
  input: Record<string, unknown>
}

export interface FormVerifierResult {
  approved: boolean
  reason: string
  costLLM: boolean
}

export class FormVerifier {
  constructor(private adapter: ModelAdapter) {}

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

  async checkCoherence(proposal: ToolProposal, lastUserTurn: string): Promise<FormVerifierResult> {
    logger.debug(`checkCoherence: tool=${proposal.name}`)
    const prompt = `Último pedido del usuario: "${lastUserTurn}"
Herramienta propuesta: ${proposal.name}(${JSON.stringify(proposal.input)})
¿Esta llamada responde directamente al pedido del usuario? Responde SOLO YES o NO.`

    const response = await this.adapter.complete([
      { role: 'user', content: prompt }
    ], { temperature: 0 })

    const answer = this.parseAnswer(response)
    if (answer === 'YES') {
      return { approved: true, reason: response, costLLM: true }
    }
    if (answer === 'NO') {
      return { approved: false, reason: response, costLLM: true }
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
    lastUserTurn: string
  ): Promise<FormVerifierResult> {
    const schemaResult = this.checkSchema(proposal, declaredTools)
    if (!schemaResult.approved) {
      return schemaResult
    }
    return this.checkCoherence(proposal, lastUserTurn)
  }
}
