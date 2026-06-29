export interface Step {
  id: string
  order: number
  description: string
  reasoning: string
  verified: boolean
}

export interface Plan {
  id: string
  summary: string
  steps: Step[]
  createdAt: Date
}

export interface ComplexityResult {
  isComplex: boolean
  reason: string
  suggestedSteps: number
}

export interface StepFailure {
  stepId: string
  error: string
}

export interface ExecutionResult {
  success: boolean
  steps: Step[]
  failures: StepFailure[]
  finalOutput: string
}

export interface VerificationResult {
  isVerified: boolean
  verificationReport: string
  issuesFound: string[]
}

export interface ValidationResult {
  isApproved: boolean
  userMessage: string | null
  needsIteration: boolean
  plan: Plan
}

export interface ResolutionResult {
  success: boolean
  wasComplex: boolean
  complexity: ComplexityResult
  plan: Plan
  execution: ExecutionResult
  verification: VerificationResult
  validationIterations: number
  userMessages: string[]
}

export interface UserValidationRequest {
  type: 'plan_review' | 'question' | 'approval_needed'
  message: string
  plan: Plan | null
}

export interface UserValidationResponse {
  message: string
  approved: boolean
}

export type ProgressEventType =
  | 'analyzing'
  | 'planning'
  | 'validating'
  | 'executing'
  | 'verifying'
  | 'user_input_required'
  | 'complete'

export interface ProgressEvent {
  type: ProgressEventType
  message?: string
  plan?: Plan
  complexity?: ComplexityResult
  stepNumber?: number
  totalSteps?: number
  userMessage?: string
  finalOutput?: string
  verification?: VerificationResult
}

export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>

export type ExecutionContext = 'internal' | 'user-facing'

export type ModelSize = 'small' | 'medium' | 'large'

export interface ReasoningConfig {
  modelSize: ModelSize
  maxPlanSteps: number
  maxValidationIterations: number
  twoPhaseReasoning: boolean
}

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
  modelSize: 'medium',
  maxPlanSteps: 5,
  maxValidationIterations: 3,
  twoPhaseReasoning: true
}

export function createReasoningConfig(partial: Partial<ReasoningConfig> & { modelSize: ModelSize }): ReasoningConfig {
  const base = { ...DEFAULT_REASONING_CONFIG }
  if (partial.modelSize === 'small') {
    base.maxPlanSteps = 4
    base.maxValidationIterations = 3
    base.twoPhaseReasoning = false
  }
  return { ...base, ...partial }
}
