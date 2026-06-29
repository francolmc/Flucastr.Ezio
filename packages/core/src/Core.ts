import type { ChatMessage, ModelAdapter } from './adapters/ModelAdapter'
import { ConfigService, type ReasoningConfig } from './config/ConfigService'
import { ReasoningEngine, type ResolveCallbacks, type ResolutionResult } from './reasoning'
import { createReasoningConfig } from './reasoning/types'

export class Core {
  private adapter: ModelAdapter
  private reasoningEngine: ReasoningEngine

  constructor(adapter?: ModelAdapter, reasoningConfig?: Partial<ReasoningConfig> & { modelSize: ReasoningConfig['modelSize'] }) {
    this.adapter = adapter ?? ConfigService.getActiveAdapter()
    const config = reasoningConfig ?? this.loadReasoningConfig()
    this.reasoningEngine = new ReasoningEngine(this.adapter, config)
  }

  private loadReasoningConfig(): ReasoningConfig {
    try {
      const ezioConfig = ConfigService.load()
      if (ezioConfig.reasoning) {
        const { modelSize, ...rest } = ezioConfig.reasoning
        return createReasoningConfig({ modelSize: modelSize || 'medium', ...rest })
      }
    } catch {
      // ignore
    }
    return createReasoningConfig({ modelSize: 'medium' })
  }

  async chat(message: string, history: ChatMessage[] = []): Promise<string> {
    const messages: ChatMessage[] = [...history, { role: 'user', content: message }]
    return this.adapter.complete(messages)
  }

  async resolve(message: string, callbacks: ResolveCallbacks): Promise<ResolutionResult> {
    return this.reasoningEngine.resolve(message, callbacks)
  }
}
