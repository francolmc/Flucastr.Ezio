declare module '@ezio/sdk' {
  import type { ModelAdapter, CoreOutput, ChatMessage, Tool, Fact } from '@ezio/core'

  export interface EzioClientConfig {
    adapter?: ModelAdapter
    tools?: Tool[]
    toolExecutor?: (name: string, input: Record<string, unknown>) => Promise<string>
    systemPrompt?: string
    userProfile?: Fact[]
  }

  export class EzioClient {
    constructor(config?: EzioClientConfig)
    send(message: string): Promise<string>
    resolve(message: string): Promise<CoreOutput>
    getHistory(): ChatMessage[]
    clearHistory(): void
  }
}

declare module '@ezio/core' {
  export interface EzioConfig {
    model: { provider: 'ollama' | 'anthropic' | 'google'; name: string }
    providers: {
      ollama?: { baseUrl: string }
      anthropic?: { apiKey: string }
      google?: { apiKey: string }
    }
    reasoning?: {
      modelSize: 'small' | 'medium' | 'large'
      maxPlanSteps: number
      maxValidationIterations: number
      twoPhaseReasoning: boolean
    }
    provider?: 'ollama' | 'anthropic' | 'google' | 'openai'
    apiKey?: string
    baseUrl?: string
  }

  export interface ReasoningConfig {
    modelSize: 'small' | 'medium' | 'large'
    maxPlanSteps: number
    maxValidationIterations: number
    twoPhaseReasoning: boolean
  }

  export class ConfigService {
    static load(configPath?: string): EzioConfig
    static getActiveAdapter(config?: EzioConfig): ModelAdapter
    static createAdapter(config?: EzioConfig): ModelAdapter
  }

  export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
  }

  export interface Tool {
    name: string
    description: string
    inputSchema: Record<string, unknown>
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

  export interface CoreOutput {
    response: string
    stepResults: StepResult[]
    classification: 'simple' | 'moderate' | 'complex'
  }

  export interface ModelAdapter {
    complete(messages: ChatMessage[]): Promise<string>
  }

  export class Core {
    constructor(adapter?: ModelAdapter)
    chat(message: string, history?: ChatMessage[]): Promise<string>
  }
}
