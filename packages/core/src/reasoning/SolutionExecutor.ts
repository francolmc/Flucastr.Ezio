import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Plan, Step, ExecutionResult, StepFailure, ReasoningConfig, ExecutionContext } from './types'

export class SolutionExecutor {
  constructor(
    private adapter: ModelAdapter,
    private config: ReasoningConfig
  ) {}

  async execute(plan: Plan, originalProblem: string, context: ExecutionContext = 'internal'): Promise<ExecutionResult> {
    const executedSteps: Step[] = []
    const failures: StepFailure[] = []
    let currentContext = originalProblem
    const maxSteps = Math.min(this.config.maxPlanSteps, plan.steps.length)

    for (let i = 0; i < maxSteps; i++) {
      const step = plan.steps[i]
      try {
        const stepResult = await this.executeStep(step, currentContext, plan.steps.slice(0, i), context)
        currentContext = stepResult.updatedContext
        executedSteps.push({ ...step, verified: stepResult.success })
      } catch (error) {
        failures.push({
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error)
        })
        executedSteps.push({ ...step, verified: false })
      }
    }

    const finalOutput = await this.generateFinalOutput(plan, executedSteps, currentContext, context)

    return {
      success: failures.length === 0,
      steps: executedSteps,
      failures,
      finalOutput
    }
  }

  private async executeStep(
    step: Step,
    context: string,
    previousSteps: Step[],
    context2: ExecutionContext
  ): Promise<{ updatedContext: string; success: boolean }> {
    const previousDesc = previousSteps.map(s => s.description).join(', ') || 'none'

    if (context2 === 'user-facing') {
      const prompt = `Step ${step.order}: ${step.description}
Previous steps: ${previousDesc}
Context: ${context}

Execute this step thoroughly. Explain what you're doing and why.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return {
        updatedContext: `${context}\n[Step ${step.order}] ${response}`.slice(-2000),
        success: response.length > 0
      }
    }

    const prompt = `Step ${step.order}: ${step.description}
Context: ${context}
Previous: ${previousDesc}

Execute briefly.`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])

    return {
      updatedContext: `${context}\n[Step ${step.order}] ${response}`.slice(-2000),
      success: response.length > 0
    }
  }

  private async generateFinalOutput(
    plan: Plan,
    executedSteps: Step[],
    context: string,
    context2: ExecutionContext
  ): Promise<string> {
    if (context2 === 'user-facing') {
      const prompt = `Problem: ${plan.summary}
Steps completed: ${executedSteps.filter(s => s.verified).length}/${executedSteps.length}
Working context: ${context}

Provide a clear, final answer. Explain the solution thoroughly.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Problem: ${plan.summary}
Steps done: ${executedSteps.filter(s => s.verified).length}/${executedSteps.length}
Context: ${context}

Give final answer briefly.`

    return this.adapter.complete([{ role: 'user', content: prompt }])
  }
}
