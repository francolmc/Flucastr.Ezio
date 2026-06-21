// NOTE: This SDK currently imports @ezio/core directly (in-process).
// @ezio/sdk is licensed AGPLv3 while this remains true. Once the SDK
// communicates with Core exclusively over network (via @ezio/api),
// this package will be relicensed to Apache 2.0.

import { Core } from '@ezio/core'
import type { ChatMessage } from '@ezio/core'

export class EzioClient {
  private history: ChatMessage[] = []
  private core: Core

  constructor() {
    this.core = new Core()
  }

  async send(message: string): Promise<string> {
    const response = await this.core.chat(message, [...this.history])
    this.history.push({ role: 'user', content: message })
    this.history.push({ role: 'assistant', content: response })
    return response
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }
}