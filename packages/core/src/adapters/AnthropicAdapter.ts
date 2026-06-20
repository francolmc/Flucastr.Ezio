import type { ChatMessage, ModelAdapter } from './ModelAdapter.js'

export interface AnthropicAdapterConfig {
  apiKey: string
  model: string
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicRequestBody {
  model: string
  messages: AnthropicMessage[]
  max_tokens: number
  system?: string
}

export class AnthropicAdapter implements ModelAdapter {
  constructor(private config: AnthropicAdapterConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const { apiKey, model } = this.config

    const systemMessage = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const body: AnthropicRequestBody = {
      model,
      messages: chatMessages as AnthropicMessage[],
      max_tokens: 4096
    }

    if (systemMessage) {
      body.system = systemMessage.content
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${bodyText}`)
    }

    const data = await response.json() as { content?: Array<{ type: string; text?: string }> }

    const textBlock = data.content?.find(block => block.type === 'text')

    if (!textBlock?.text) {
      throw new Error('Anthropic API response missing text content block')
    }

    return textBlock.text
  }
}