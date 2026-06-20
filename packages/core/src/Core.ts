import type { ChatMessage, ModelAdapter } from './adapters/ModelAdapter.js'
import { ConfigService } from './config/ConfigService.js'

export class Core {
  private adapter: ModelAdapter

  constructor(adapter?: ModelAdapter) {
    this.adapter = adapter ?? ConfigService.getActiveAdapter()
  }

  async chat(message: string, history: ChatMessage[] = []): Promise<string> {
    const messages: ChatMessage[] = [...history, { role: 'user', content: message }]
    return this.adapter.complete(messages)
  }
}