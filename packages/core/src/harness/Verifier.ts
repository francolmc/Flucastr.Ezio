import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { VerifierResult } from '../types/index'
import { buildVerifyPrompt } from './prompts'
import { createLogger } from '../utils/Logger'

export class Verifier {
  private logger = createLogger('Verifier')

  constructor(private adapter: ModelAdapter) {}

  async verify(objective: string, result: string): Promise<VerifierResult> {
    const response = await this.adapter.complete([
      { role: 'system', content: buildVerifyPrompt(objective, result) },
      { role: 'user', content: 'Does the result accomplish the objective? Answer YES or NO.' }
    ], { temperature: 0 })
    const firstLine = response.split('\n')[0].trim().toUpperCase()

    if (firstLine.startsWith('YES')) {
      return { approved: true, reason: response }
    }

    if (firstLine.startsWith('NO')) {
      return { approved: false, reason: response }
    }

    this.logger.warn(`unclear response, assuming approved: ${response}`)
    return { approved: true, reason: 'unclear response, assuming approved' }
  }
}
