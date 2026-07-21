export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json'
  think?: boolean
}

export interface ModelAdapter {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
}