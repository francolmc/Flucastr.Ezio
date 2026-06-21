import type { ChatMessage, ModelAdapter } from './ModelAdapter'

export interface OllamaConfig {
  baseUrl: string
  model: string
}

export class OllamaAdapter implements ModelAdapter {
  constructor(private config: OllamaConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${body}`)
    }

    const data = await response.json() as { message?: { content?: string } }

    if (!data.message?.content) {
      throw new Error('Ollama API response missing message.content field')
    }

    return data.message.content
  }
}