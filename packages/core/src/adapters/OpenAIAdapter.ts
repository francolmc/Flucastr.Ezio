import type { ChatMessage, ModelAdapter } from './ModelAdapter'

export interface OpenAIConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export class OpenAIAdapter implements ModelAdapter {
  constructor(private config: OpenAIConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: 4096
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${body}`)
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] }

    const content = data.choices?.[0]?.message?.content

    if (content == null) {
      throw new Error('OpenAI API response missing choices[0].message.content field')
    }

    return content
  }
}
