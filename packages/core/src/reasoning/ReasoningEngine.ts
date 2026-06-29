import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { ResolutionResult, Plan, UserValidationRequest, ReasoningConfig, ProgressCallback, ProgressEvent } from './types'
import { createReasoningConfig } from './types'
import { ProblemAnalyzer } from './ProblemAnalyzer'
import { SolutionPlanner } from './SolutionPlanner'
import { PlanValidator } from './PlanValidator'
import { SolutionExecutor } from './SolutionExecutor'
import { SolutionVerifier } from './SolutionVerifier'

export interface ResolveCallbacks {
  onUserValidation: (request: UserValidationRequest) => Promise<string>
  onProgress?: ProgressCallback
}

export class ReasoningEngine {
  private problemAnalyzer: ProblemAnalyzer
  private solutionPlanner: SolutionPlanner
  private planValidator: PlanValidator
  private solutionExecutor: SolutionExecutor
  private solutionVerifier: SolutionVerifier
  private config: ReasoningConfig

  constructor(adapter: ModelAdapter, config?: Partial<ReasoningConfig> & { modelSize: ReasoningConfig['modelSize'] }) {
    this.config = createReasoningConfig(config || { modelSize: 'medium' })
    this.problemAnalyzer = new ProblemAnalyzer(adapter, this.config)
    this.solutionPlanner = new SolutionPlanner(adapter, this.config)
    this.planValidator = new PlanValidator(adapter, this.config)
    this.solutionExecutor = new SolutionExecutor(adapter, this.config)
    this.solutionVerifier = new SolutionVerifier(adapter, this.config)
  }

  async resolve(input: string, callbacks: ResolveCallbacks): Promise<ResolutionResult> {
    const userMessages: string[] = []
    let validationIterations = 0

    callbacks.onProgress?.({ type: 'analyzing', message: 'Analizando el problema...' })
    const complexity = await this.problemAnalyzer.analyze(input)
    callbacks.onProgress?.({
      type: 'analyzing',
      message: complexity.isComplex ? 'Problema complejo detectado' : 'Problema simple',
      complexity
    })

    callbacks.onProgress?.({ type: 'planning', message: 'Creando plan de solución...' })
    const plan = await this.solutionPlanner.createPlan(input, complexity)
    callbacks.onProgress?.({ type: 'planning', message: 'Plan creado', plan })

    let finalPlan = plan

    if (complexity.isComplex) {
      callbacks.onProgress?.({ type: 'validating', message: 'Esperando aprobación del plan...' })
      const validation = await this.runValidationLoop(plan, userMessages, callbacks)
      userMessages.push(...validation.userMessages)
      validationIterations = validation.iterations
      if (!validation.plan) {
        throw new Error('Plan validation did not complete')
      }
      finalPlan = validation.plan
    }

    callbacks.onProgress?.({ type: 'executing', message: 'Ejecutando plan...', plan: finalPlan })
    const execution = await this.solutionExecutor.execute(
      complexity.isComplex && userMessages.length > 0
        ? this.mergeUserContext(finalPlan, userMessages)
        : finalPlan,
      input
    )
    callbacks.onProgress?.({
      type: 'executing',
      message: execution.success ? 'Ejecución completada' : 'Ejecución con fallos',
      plan: finalPlan,
      finalOutput: execution.finalOutput
    })

    callbacks.onProgress?.({ type: 'verifying', message: 'Verificando solución...' })
    const verification = await this.solutionVerifier.verify(execution, input)
    callbacks.onProgress?.({ type: 'complete', verification })

    return {
      success: execution.success && verification.isVerified,
      wasComplex: complexity.isComplex,
      complexity,
      plan: finalPlan,
      execution,
      verification,
      validationIterations,
      userMessages
    }
  }

  private async runValidationLoop(
    initialPlan: Plan,
    userMessages: string[],
    callbacks: ResolveCallbacks
  ): Promise<{ plan: Plan; userMessages: string[]; iterations: number }> {
    let currentPlan = initialPlan
    let iterations = 0
    const maxIterations = this.config.maxValidationIterations

    while (iterations < maxIterations) {
      iterations++

      callbacks.onProgress?.({
        type: 'validating',
        message: `Iteración ${iterations}/${maxIterations}`,
        plan: currentPlan
      })

      const validation = await this.planValidator.validatePlan(currentPlan, 'internal')

      if (validation.isApproved) {
        callbacks.onProgress?.({ type: 'validating', message: 'Plan aprobado', plan: currentPlan })
        return { plan: currentPlan, userMessages, iterations }
      }

      callbacks.onProgress?.({
        type: 'user_input_required',
        message: validation.userMessage || '¿Apruebas este plan?',
        plan: currentPlan
      })

      const userResponse = await callbacks.onUserValidation({
        type: 'approval_needed',
        message: validation.userMessage || 'Please review and approve the plan',
        plan: currentPlan
      })
      userMessages.push(userResponse)

      callbacks.onProgress?.({
        type: 'validating',
        message: 'Procesando feedback...',
        plan: currentPlan
      })

      const continuation = await this.planValidator.continueValidation(currentPlan, userResponse, 'user-facing')
      currentPlan = continuation.plan

      if (continuation.isApproved) {
        callbacks.onProgress?.({ type: 'validating', message: 'Plan aprobado', plan: currentPlan })
        return { plan: currentPlan, userMessages, iterations }
      }
    }

    throw new Error('Plan validation exceeded maximum iterations')
  }

  private mergeUserContext(plan: Plan, userMessages: string[]): Plan {
    const contextNote = userMessages.length > 0
      ? `\n\nUser feedback considered: ${userMessages.join('; ')}`
      : ''

    return {
      ...plan,
      summary: plan.summary + contextNote
    }
  }
}
