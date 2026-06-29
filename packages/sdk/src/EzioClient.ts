// NOTE: This SDK currently imports @ezio/core directly (in-process).
// @ezio/sdk is licensed AGPLv3 while this remains true. Once the SDK
// communicates with Core exclusively over network (via @ezio/api),
// this package will be relicensed to Apache 2.0.

import { Core } from '@ezio/core'
import type { ChatMessage, ResolutionResult, UserValidationRequest, ProgressEvent } from '@ezio/core'

export interface EzioClientConfig {
  userValidationHandler?: (request: UserValidationRequest) => string | Promise<string>
  progressHandler?: (event: ProgressEvent) => void
}

export class EzioClient {
  private history: ChatMessage[] = []
  private core: Core
  private userValidationHandler: (request: UserValidationRequest) => Promise<string>
  private progressHandler?: (event: ProgressEvent) => void

  constructor(config: EzioClientConfig = {}) {
    this.core = new Core()
    this.progressHandler = config.progressHandler
    this.userValidationHandler = async (request: UserValidationRequest) => {
      if (config.userValidationHandler) {
        const result = config.userValidationHandler(request)
        return typeof result === 'string' ? result : await result
      }
      throw new Error('No user validation handler configured')
    }
  }

  async send(message: string): Promise<string> {
    const response = await this.core.chat(message, [...this.history])
    this.history.push({ role: 'user', content: message })
    this.history.push({ role: 'assistant', content: response })
    return response
  }

  async resolve(message: string): Promise<ResolutionResult> {
    return this.core.resolve(message, {
      onUserValidation: this.userValidationHandler,
      onProgress: this.progressHandler
    })
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }
}
