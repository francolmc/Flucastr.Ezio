import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { VerifierResult } from '../types/index'
import { buildVerifyPrompt } from './prompts'
import { createLogger } from '../utils/Logger'

export class Verifier {
  private logger = createLogger('Verifier')

  constructor(private adapter: ModelAdapter) {}

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

  async verify(objective: string, result: string): Promise<VerifierResult> {
    const response = await this.adapter.complete([
      { role: 'system', content: buildVerifyPrompt(objective, result) },
      { role: 'user', content: 'Does the result accomplish the objective? Answer YES or NO.' }
    ], { temperature: 0 })
    const answer = this.parseAnswer(response)
    if (answer === 'YES') return { approved: true, reason: response }
    if (answer === 'NO') return { approved: false, reason: response }
    this.logger.warn(`unclear response, treating as rejection: ${response.slice(0, 200)}`)
    return { approved: false, reason: 'unclear Verifier response, treated as rejection out of caution' }
  }
}
