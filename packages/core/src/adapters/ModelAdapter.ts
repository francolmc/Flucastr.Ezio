export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ModelAdapter {
  complete(messages: ChatMessage[]): Promise<string>
}