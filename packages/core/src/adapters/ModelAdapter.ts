export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  temperature?: number
  maxTokens?: number
}

export interface ModelAdapter {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
}