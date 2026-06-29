import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Plan, Step, ComplexityResult, ReasoningConfig, ExecutionContext } from './types'

export class SolutionPlanner {
  constructor(
    private adapter: ModelAdapter,
    private config: ReasoningConfig
  ) {}

  async createPlan(input: string, complexity: ComplexityResult, context: ExecutionContext = 'internal'): Promise<Plan> {
    const maxSteps = Math.min(this.config.maxPlanSteps, complexity.suggestedSteps)

    if (this.config.twoPhaseReasoning) {
      const reasoning = await this.reason(input, complexity, maxSteps, context)
      return this.serialize(reasoning, maxSteps, context)
    }
    return this.createPlanDirect(input, complexity, maxSteps, context)
  }

  private async reason(input: string, complexity: ComplexityResult, maxSteps: number, context: ExecutionContext): Promise<string> {
    if (context === 'user-facing') {
      const prompt = `Create a plan to solve this problem. Be thorough and clear.

Problem: ${input}
Complexity: ${complexity.isComplex ? 'complex' : 'simple'}
Reason: ${complexity.reason}
Max steps: ${maxSteps}

Think through each step carefully.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Create a plan to solve this problem.

Problem: ${input}
Complexity: ${complexity.isComplex ? 'complex' : 'simple'}
Max steps: ${maxSteps}

List steps briefly.`

    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private async serialize(reasoning: string, maxSteps: number, context: ExecutionContext): Promise<Plan> {
    if (context === 'user-facing') {
      const prompt = `Convert this plan to a clear structured format:

${reasoning}

Output JSON with max ${maxSteps} steps: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}

Be clear and thorough.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, maxSteps)
    }

    const prompt = `Convert this plan to JSON with max ${maxSteps} steps:

${reasoning}

Output JSON: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, maxSteps)
  }

  private async createPlanDirect(input: string, complexity: ComplexityResult, maxSteps: number, context: ExecutionContext): Promise<Plan> {
    if (context === 'user-facing') {
      const prompt = `Create a clear plan to solve this problem. Output JSON directly.

Problem: ${input}
Complexity: ${complexity.isComplex ? 'complex' : 'simple'}
Max steps: ${maxSteps}

Output ONLY JSON: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, maxSteps)
    }

    const prompt = `Create a plan to solve this problem. Output JSON directly.

Problem: ${input}
Max steps: ${maxSteps}

Output ONLY JSON: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, maxSteps)
  }

  private parseResponse(response: string, maxSteps: number): Plan {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const steps: Step[] = (parsed.steps || []).slice(0, maxSteps).map(
          (s: { order?: number; description?: string; reasoning?: string }, index: number) => ({
            id: this.generateId(),
            order: Number(s.order) || index + 1,
            description: String(s.description || `Step ${index + 1}`),
            reasoning: String(s.reasoning || ''),
            verified: false
          })
        )

        return {
          id: this.generateId(),
          summary: String(parsed.summary || `${steps.length} steps`),
          steps: steps.sort((a: Step, b: Step) => a.order - b.order),
          createdAt: new Date()
        }
      }
    } catch {
      // fall through
    }

    return this.createDefaultPlan(maxSteps)
  }

  private createDefaultPlan(count: number): Plan {
    return {
      id: this.generateId(),
      summary: `${count} steps`,
      steps: Array.from({ length: count }, (_, i) => ({
        id: this.generateId(),
        order: i + 1,
        description: `Step ${i + 1}`,
        reasoning: '',
        verified: false
      })),
      createdAt: new Date()
    }
  }

  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}
