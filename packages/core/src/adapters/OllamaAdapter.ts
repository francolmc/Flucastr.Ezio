import type { ChatMessage, ModelAdapter, CompletionOptions } from './ModelAdapter'
import { createLogger } from '../utils/Logger'

export interface OllamaConfig {
  baseUrl: string
  model: string
}

export class OllamaAdapter implements ModelAdapter {
  constructor(private config: OllamaConfig) {}

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        ...(options?.think !== undefined ? { think: options.think } : {}),
        ...(options?.responseFormat === 'json'
          ? { format: 'json' }
          : options?.responseFormat
            ? { format: options.responseFormat }
            : {}),
        options: {
          temperature: options?.temperature ?? 0.7,
          ...(options?.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
          ...(options?.numCtx !== undefined ? { num_ctx: options.numCtx } : {}),
          ...(options?.numGpu !== undefined ? { num_gpu: options.numGpu } : {})
        }
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${body}`)
    }

    const data = await response.json() as {
      message?: { content?: string },
      total_duration?: number,
      load_duration?: number,
      prompt_eval_count?: number,
      prompt_eval_duration?: number,
      eval_count?: number,
      eval_duration?: number
    }

    if (!data.message?.content) {
      throw new Error('Ollama API response missing message.content field')
    }

    const logger = createLogger('OllamaAdapter')
    logger.debug('ollama timing', {
      total_ms: data.total_duration ? Math.round(data.total_duration / 1e6) : undefined,
      load_ms: data.load_duration ? Math.round(data.load_duration / 1e6) : undefined,
      promptEval_ms: data.prompt_eval_duration ? Math.round(data.prompt_eval_duration / 1e6) : undefined,
      promptEvalCount: data.prompt_eval_count,
      eval_ms: data.eval_duration ? Math.round(data.eval_duration / 1e6) : undefined,
      evalCount: data.eval_count
    })

    return data.message.content
  }
}