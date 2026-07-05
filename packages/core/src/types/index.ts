export { ChatMessage } from '../adapters/ModelAdapter'

export interface Fact {
  key: string
  value: string
}

export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
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
}

export interface HarnessContext {
  systemPromptBase: string
  subtask: Subtask
  previousSummaries: string[]
  tools: Tool[]
  classification: 'simple' | 'moderate' | 'complex'
}

export interface CoreInput {
  message: string
  tools: Tool[]
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>
  systemPrompt?: string
  sessionContext?: string
  userProfile?: Fact[]
  isSubAgent?: boolean
}

export interface CoreOutput {
  response: string
  stepResults: StepResult[]
  classification: 'simple' | 'moderate' | 'complex'
}

export interface VerifierResult {
  approved: boolean
  reason: string
}
