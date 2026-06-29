import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Plan, Step, ValidationResult, ReasoningConfig, ExecutionContext } from './types'

export class PlanValidator {
  constructor(
    private adapter: ModelAdapter,
    private config: ReasoningConfig
  ) {}

  async validatePlan(plan: Plan, context: ExecutionContext = 'internal'): Promise<ValidationResult> {
    if (this.config.twoPhaseReasoning) {
      const reasoning = await this.reasonInitial(plan, context)
      return this.serialize(reasoning, plan, context)
    }
    return this.validatePlanDirect(plan, context)
  }

  async continueValidation(plan: Plan, userResponse: string, context: ExecutionContext = 'internal'): Promise<ValidationResult> {
    if (this.checkIfApproved(userResponse)) {
      return { isApproved: true, userMessage: null, needsIteration: false, plan }
    }

    const revisedPlan = await this.revisePlan(plan, userResponse, context)
    if (this.config.twoPhaseReasoning) {
      const reasoning = await this.reasonPresentation(revisedPlan, context)
      return this.serialize(reasoning, revisedPlan, context)
    }
    return this.validatePlanDirect(revisedPlan, context)
  }

  private checkIfApproved(userResponse: string): boolean {
    const approvalPhrases = ['ok', 'yes', 'proceed', 'approved', 'go ahead', 'si', 'sí', 'de acuerdo', 'correcto']
    const lower = userResponse.toLowerCase().trim()
    return approvalPhrases.some(p => lower === p || lower.includes(` ${p}`) || lower.includes(`${p} `))
  }

  private async reasonInitial(plan: Plan, context: ExecutionContext): Promise<string> {
    const steps = plan.steps.map(s => `${s.order}. ${s.description}`).join(', ')

    if (context === 'user-facing') {
      const prompt = `You are explaining a solution plan to a user. Make it clear and understandable.

PLAN: ${plan.summary}
STEPS: ${steps}

Explain briefly what this plan does and ask if they approve. Be friendly and clear.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Review plan: ${plan.summary}. Steps: ${steps}
Is it clear? Any concerns?`
    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private async serialize(reasoning: string, plan: Plan, context: ExecutionContext): Promise<ValidationResult> {
    if (context === 'user-facing') {
      const prompt = `Based on your explanation to the user:

${reasoning}

Output JSON: {"isApproved": boolean, "needsIteration": boolean, "userMessage": string or null}

If the plan is clear and ready for user feedback, set needsIteration=true and provide a brief message to ask for their approval.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, plan, context)
    }

    const prompt = `Based on: ${reasoning}

Output JSON: {"isApproved": boolean, "needsIteration": boolean, "userMessage": string or null}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, plan, context)
  }

  private async validatePlanDirect(plan: Plan, context: ExecutionContext): Promise<ValidationResult> {
    const steps = plan.steps.map(s => `${s.order}. ${s.description}`).join(', ')

    if (context === 'user-facing') {
      const prompt = `Explain this plan to the user clearly:

PLAN: ${plan.summary}
STEPS: ${steps}

Output JSON: {"isApproved": boolean, "needsIteration": boolean, "userMessage": string or null}
Ask for approval in the message.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, plan, context)
    }

    const prompt = `Review plan: ${plan.summary}. Steps: ${steps}
Output JSON: {"isApproved": boolean, "needsIteration": boolean, "userMessage": string or null}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, plan, context)
  }

  private async revisePlan(plan: Plan, userResponse: string, context: ExecutionContext): Promise<Plan> {
    const reasoning = await this.reasonRevision(plan, userResponse, context)
    return this.serializeRevision(reasoning, plan, context)
  }

  private async reasonRevision(plan: Plan, userResponse: string, context: ExecutionContext): Promise<string> {
    const steps = plan.steps.map(s => `${s.order}. ${s.description}`).join(', ')

    if (context === 'user-facing') {
      const prompt = `The user has given feedback on the plan. Understand what they want changed.

USER FEEDBACK: ${userResponse}
CURRENT PLAN: ${steps}

How would you explain to the user that you're revising the plan based on their feedback?`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `User feedback: ${userResponse}
Current plan: ${steps}
How to improve?`
    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private async serializeRevision(reasoning: string, originalPlan: Plan, context: ExecutionContext): Promise<Plan> {
    if (context === 'user-facing') {
      const prompt = `Revise the plan based on the user's feedback:

${reasoning}
Max ${this.config.maxPlanSteps} steps.

Output JSON: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}

Be clear about what changed in the revised plan.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseRevisionResponse(response, originalPlan)
    }

    const prompt = `Revise plan based on: ${reasoning}
Max ${this.config.maxPlanSteps} steps.

Output JSON: {"summary": string, "steps": [{"order": 1, "description": string, "reasoning": string}]}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseRevisionResponse(response, originalPlan)
  }

  private async reasonPresentation(plan: Plan, context: ExecutionContext): Promise<string> {
    const steps = plan.steps.map(s => `${s.order}. ${s.description}`).join(', ')

    if (context === 'user-facing') {
      const prompt = `Present the revised plan to the user clearly:

PLAN: ${plan.summary}
STEPS: ${steps}

How would you explain what changed and ask for approval? Be friendly.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Present revised plan: ${plan.summary}
Steps: ${steps}

Ask for approval.`
    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private parseResponse(response: string, plan: Plan, context: ExecutionContext): ValidationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          isApproved: Boolean(parsed.isApproved),
          needsIteration: parsed.needsIteration !== false,
          userMessage: parsed.userMessage ? String(parsed.userMessage) : null,
          plan
        }
      }
    } catch {
      // fall through
    }

    if (context === 'user-facing') {
      const steps = plan.steps.map(s => `${s.order}. ${s.description}`).join(', ')
      return {
        isApproved: false,
        needsIteration: true,
        userMessage: `Here's the plan: ${steps}. Do you approve it?`,
        plan
      }
    }

    return {
      isApproved: false,
      needsIteration: true,
      userMessage: null,
      plan
    }
  }

  private parseRevisionResponse(response: string, originalPlan: Plan): Plan {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const steps: Step[] = (parsed.steps || []).slice(0, this.config.maxPlanSteps).map(
          (s: { order?: number; description?: string; reasoning?: string }, index: number) => ({
            id: this.generateId(),
            order: Number(s.order) || index + 1,
            description: String(s.description || `Step ${index + 1}`),
            reasoning: String(s.reasoning || ''),
            verified: false
          })
        )

        return {
          id: originalPlan.id,
          summary: String(parsed.summary || originalPlan.summary),
          steps: steps.sort((a: Step, b: Step) => a.order - b.order),
          createdAt: originalPlan.createdAt
        }
      }
    } catch {
      // fall through
    }

    return originalPlan
  }

  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}
