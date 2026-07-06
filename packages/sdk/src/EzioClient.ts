// NOTE: This SDK currently imports @ezio/core directly (in-process).
// @ezio/sdk is licensed AGPLv3 while this remains true. Once the SDK
// communicates with Core exclusively over network (via @ezio/api),
// this package will be relicensed to Apache 2.0.

import { Core } from '@ezio/core'
import { ConfigService } from '@ezio/core'
import type { CoreInput, CoreOutput, ChatMessage, Tool, Fact } from '@ezio/core'
import type { ModelAdapter } from '@ezio/core'
import { LanguageMiddleware } from './LanguageMiddleware'

export interface EzioClientConfig {
  adapter?: ModelAdapter
  tools?: Tool[]
  toolExecutor?: (name: string, input: Record<string, unknown>) => Promise<string>
  systemPrompt?: string
  userProfile?: Fact[]
}

export class EzioClient {
  private core: Core
  private history: ChatMessage[]
  private tools: Tool[]
  private toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>
  private systemPrompt: string
  private userProfile: Fact[]
  private languageMiddleware: LanguageMiddleware
  private detectedLanguage: string = 'en'

  constructor(config: EzioClientConfig = {}) {
    const adapter = config.adapter ?? ConfigService.createAdapter()
    this.core = new Core(adapter)
    this.history = []
    this.tools = config.tools ?? []
    this.toolExecutor = config.toolExecutor ?? (() => Promise.resolve(''))
    this.systemPrompt = config.systemPrompt ?? 'You are Ezio, a personal assistant.'
    this.userProfile = config.userProfile ?? []
    this.languageMiddleware = new LanguageMiddleware(adapter)
  }

  async send(message: string): Promise<string> {
    const output = await this.resolve(message)
    return output.response
  }

  async resolve(message: string): Promise<CoreOutput> {
    const sessionContext = this.history.length > 0
      ? this.history.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n')
      : undefined

    const coreInput: CoreInput = {
      message,
      tools: this.tools,
      toolExecutor: this.toolExecutor,
      systemPrompt: this.systemPrompt,
      sessionContext,
      userProfile: this.userProfile
    }

    const output = await this.core.process(coreInput)

    const detected = this.languageMiddleware.detectLanguage(message)
    if (detected !== 'en' || this.history.length === 0) {
      this.detectedLanguage = detected
    }

    let finalResponse = output.response
    if (this.detectedLanguage !== 'en') {
      try {
        finalResponse = await this.languageMiddleware.translate(
          output.response,
          this.detectedLanguage
        )
      } catch {
        finalResponse = output.response
      }
    }

    this.history.push({ role: 'user', content: message })
    this.history.push({ role: 'assistant', content: output.response })

    return { ...output, response: finalResponse }
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }
}
