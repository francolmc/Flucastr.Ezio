import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { VerifierResult } from '../types/index'
import { buildVerifyPrompt } from './prompts'

export class Verifier {
  constructor(private adapter: ModelAdapter) {}

  async verify(objective: string, result: string): Promise<VerifierResult> {
    const prompt = buildVerifyPrompt(objective, result)
    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    const firstLine = response.split('\n')[0].trim().toUpperCase()

    if (firstLine.startsWith('YES')) {
      return { approved: true, reason: response }
    }

    if (firstLine.startsWith('NO')) {
      return { approved: false, reason: response }
    }

    console.warn(`[Verifier] unclear response, assuming approved: ${response}`)
    return { approved: true, reason: 'unclear response, assuming approved' }
  }
}
