import type { ChatMessage, ModelAdapter } from './ModelAdapter'

export interface GoogleConfig {
  apiKey: string
  model: string
}

export class GoogleAdapter implements ModelAdapter {
  constructor(private config: GoogleConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')
    const conversationMessages = messages.filter(m => m.role !== 'system')

    const contents = conversationMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }))

    const requestBody: {
      contents: { role: string; parts: { text: string }[] }[]
      systemInstruction?: { parts: { text: string }[] }
    } = { contents }

    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }]
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Google API error: ${response.status} - ${body}`)
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('Google API response missing candidates[0].content.parts[0].text')
    }

    return text
  }
}