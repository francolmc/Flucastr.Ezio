import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { ComplexityResult, ReasoningConfig, ExecutionContext } from './types'

export class ProblemAnalyzer {
  constructor(
    private adapter: ModelAdapter,
    private config: ReasoningConfig
  ) {}

  async analyze(input: string, context: ExecutionContext = 'internal'): Promise<ComplexityResult> {
    if (this.config.twoPhaseReasoning) {
      const reasoning = await this.reason(input, context)
      return this.serialize(reasoning, context)
    }
    return this.analyzeDirect(input, context)
  }

  private async reason(input: string, context: ExecutionContext): Promise<string> {
    if (context === 'user-facing') {
      const prompt = `Analyze this problem carefully.

Problem: ${input}

Determine if it's complex. Consider: multiple steps, ambiguity, trade-offs, need for validation.
Be thorough.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Analyze this problem and determine if it's complex.

Problem: ${input}

Is it complex? Consider: multiple steps needed, ambiguity, trade-offs, need for validation.
Respond briefly.`

    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private async serialize(reasoning: string, context: ExecutionContext): Promise<ComplexityResult> {
    if (context === 'user-facing') {
      const prompt = `Based on your analysis, provide the complexity result clearly:

${reasoning}

Output JSON: {"isComplex": boolean, "reason": string, "suggestedSteps": number}`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response)
    }

    const prompt = `Based on this analysis, extract the result:

${reasoning}

Output JSON: {"isComplex": boolean, "reason": string, "suggestedSteps": number}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response)
  }

  private async analyzeDirect(input: string, context: ExecutionContext): Promise<ComplexityResult> {
    if (context === 'user-facing') {
      const prompt = `Analyze this problem carefully and output JSON.

Problem: ${input}

Consider: multiple steps, ambiguity, trade-offs, validation needs.
Output ONLY valid JSON: {"isComplex": boolean, "reason": string, "suggestedSteps": number}`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response)
    }

    const prompt = `Analyze this problem and output JSON directly.

Problem: ${input}

Output ONLY valid JSON: {"isComplex": boolean, "reason": string, "suggestedSteps": number}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response)
  }

  private parseResponse(response: string): ComplexityResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          isComplex: Boolean(parsed.isComplex),
          reason: String(parsed.reason || 'No reason'),
          suggestedSteps: Math.min(this.config.maxPlanSteps, Math.max(1, Number(parsed.suggestedSteps) || 3))
        }
      }
    } catch {
      // fall through
    }

    return {
      isComplex: false,
      reason: 'Could not determine',
      suggestedSteps: 3
    }
  }
}
