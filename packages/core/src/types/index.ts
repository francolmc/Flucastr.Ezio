export { ChatMessage } from '../adapters/ModelAdapter'

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: ToolAnnotations
  contextBudget?: number
}

export interface ToolRegistry {
  callTool(name: string, input: Record<string, unknown>): Promise<string>
}

export interface Subtask {
  id: number
  objective: string
  dependsOn: number | null
}

export interface StepResult {
  subtaskId: number
  summary: string
  tool: string
  rawResult: string
  toolInput: Record<string, unknown>
  status: 'ok' | 'failed'
  failReason?: string
  microStep?: boolean
  retried?: boolean
}

export interface MicroPlanResult {
  steps: string[]
  reason: string
}

export interface HarnessContext {
  systemPromptBase: string
  subtask?: Subtask
  previousSummaries: string[]
  tools?: Tool[]
  classification: 'simple' | 'moderate' | 'complex'
  targetLanguage?: string
}

export interface CoreInput {
  message: string
  tools: Tool[]
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>
  systemPrompt?: string
  sessionContext?: string
  userProfile?: Fact[]
  isSubAgent?: boolean
  targetLanguage?: string
}

export interface ConfirmedCall {
  inputHash: string
  inputPreview: string
  stepNumber: number
}

export interface WorkingStateData {
  objective: string
  confirmedCalls: Record<string, ConfirmedCall[]>
  lastTool: string
  lastResult: string
  stepNumber: number
  toolCallCounts: Record<string, number>
}

export interface CoreOutput {
  response: string
  stepResults: StepResult[]
  classification: 'simple' | 'moderate' | 'complex'
  workingStateData?: {
    confirmedCalls: Record<string, ConfirmedCall[]>
  }
}

export interface Fact {
  key: string
  value: string
}

export interface VerifierResult {
  approved: boolean
  reason: string
  costLLM?: boolean
}
