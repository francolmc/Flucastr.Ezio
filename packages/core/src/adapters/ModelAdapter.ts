export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json' | Record<string, unknown>
  think?: boolean
  numCtx?: number
}

export interface ModelAdapter {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
}