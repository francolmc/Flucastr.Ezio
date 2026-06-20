import type { ChatMessage, ModelAdapter } from './ModelAdapter.js'

export interface OllamaAdapterConfig {
  baseUrl: string
  model: string
}

export class OllamaAdapter implements ModelAdapter {
  constructor(private config: OllamaAdapterConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const { baseUrl, model } = this.config

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
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