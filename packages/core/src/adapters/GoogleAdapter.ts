import type { ChatMessage, ModelAdapter } from './ModelAdapter.js'

export interface GoogleAdapterConfig {
  apiKey: string
  model: string
}

interface GeminiPart {
  text: string
}

interface GeminiContent {
  role?: string
  parts: GeminiPart[]
}

export class GoogleAdapter implements ModelAdapter {
  constructor(private config: GoogleAdapterConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const { apiKey, model } = this.config

    const systemMessages = messages.filter(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')

    const contents: GeminiContent[] = nonSystemMessages.map(msg => {
      const role = msg.role === 'assistant' ? 'model' : msg.role
      return {
        role,
        parts: [{ text: msg.content }]
      }
    })

    if (systemMessages.length > 0) {
      const systemText = systemMessages.map(m => m.content).join('\n')
      contents.unshift({
        role: 'user',
        parts: [{ text: systemText }]
      })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Google API error: ${response.status} - ${body}`)
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (text === undefined) {
      throw new Error('Google API response missing candidates[0].content.parts[0].text field')
    }

    return text
  }
}