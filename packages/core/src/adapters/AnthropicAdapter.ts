import type { ChatMessage, ModelAdapter, CompletionOptions } from './ModelAdapter'

export interface AnthropicConfig {
  apiKey: string
  model: string
}

export class AnthropicAdapter implements ModelAdapter {
  constructor(private config: AnthropicConfig) {}

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')
    const conversationMessages = messages.filter(m => m.role !== 'system')

    const body: {
      model: string
      messages: { role: string; content: string }[]
      max_tokens: number
      temperature: number
      system?: string
    } = {
      model: this.config.model,
      messages: conversationMessages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      temperature: options?.temperature ?? 0.7
    }

    if (systemMessage) {
      body.system = systemMessage.content
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${bodyText}`)
    }

    const data = await response.json() as {
      content?: { type?: string; text?: string }[]
    }

    const textBlock = data.content?.find(block => block.type === 'text')

    if (!textBlock?.text) {
      throw new Error('Anthropic API response missing text content block')
    }

    return textBlock.text
  }
}