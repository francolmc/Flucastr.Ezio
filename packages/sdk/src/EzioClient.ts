// NOTE: This SDK currently imports @ezio/core directly (in-process).
// @ezio/sdk is licensed AGPLv3 while this remains true. Once the SDK
// communicates with Core exclusively over network (via @ezio/api),
// this package will be relicensed to Apache 2.0.

import { Core } from '@ezio/core'
import { ConfigService } from '@ezio/core'
import type { CoreInput, CoreOutput, ChatMessage, Tool, Fact } from '@ezio/core'
import type { ModelAdapter } from '@ezio/core'
import { createConversationStore, ConversationStore } from '@ezio/core'
import { createConversationCompressor, ConversationCompressor } from '@ezio/core'
import { createFactsStore, FactsStore, createFactExtractor, FactExtractor } from '@ezio/core'
import { createLogger } from '@ezio/core'
import { randomUUID } from 'node:crypto'
import { LanguageMiddleware } from './LanguageMiddleware'

const logger = createLogger('EzioClient')

export interface EzioClientConfig {
  adapter?: ModelAdapter
  tools?: Tool[]
  toolExecutor?: (name: string, input: Record<string, unknown>) => Promise<string>
  systemPrompt?: string
  userProfile?: Fact[]
  db?: import('node:sqlite').DatabaseSync
  compressEveryN?: number
  userId?: string
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
  private store: ConversationStore | null = null
  private factsStore: FactsStore | null = null
  private factExtractor: FactExtractor | null = null
  private compressor: ConversationCompressor | null = null
  private compressEveryN: number = 10
  private currentSnapshot: string | null = null
  private sessionId: string = randomUUID()
  private turnIndex: number = 0
  private userId: string = 'local'

  constructor(config: EzioClientConfig = {}) {
    const adapter = config.adapter ?? ConfigService.createAdapter()
    this.core = new Core(adapter, config.db)
    this.history = []
    this.tools = config.tools ?? []
    this.toolExecutor = config.toolExecutor ?? (() => Promise.resolve(''))
    this.systemPrompt = config.systemPrompt ?? 'You are Ezio, a personal assistant.'
    this.userProfile = config.userProfile ?? []
    this.languageMiddleware = new LanguageMiddleware(adapter)
    if (config.db) {
      this.store = createConversationStore(config.db)
      this.factsStore = createFactsStore(config.db)
      this.factExtractor = createFactExtractor(adapter, this.factsStore)
      this.compressor = createConversationCompressor(adapter, this.store)
    }
    this.compressEveryN = config.compressEveryN ?? 10
    this.userId = config.userId ?? 'local'
  }

  async send(message: string): Promise<string> {
    const output = await this.resolve(message)
    return output.response
  }

  async resolve(message: string): Promise<CoreOutput> {
    const detected = this.languageMiddleware.detectLanguage(message)
    if (detected !== 'en' || this.history.length === 0) {
      this.detectedLanguage = detected
    }

    let sessionContext: string | undefined
    const recentTurns = this.history.slice(-6)
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n')

    if (this.currentSnapshot && recentTurns) {
      const formatted = this.compressor!.formatSnapshotForContext(this.currentSnapshot)
      sessionContext = `${formatted}\n\n[RECENT_TURNS]\n${recentTurns}\n[/RECENT_TURNS]`
    } else if (recentTurns) {
      sessionContext = recentTurns
    }

    const userProfile = this.factsStore
      ? this.factsStore.buildMemoryBlock(this.userId)
      : (this.userProfile ?? [])

    const coreInput: CoreInput = {
      message,
      tools: this.tools,
      toolExecutor: this.toolExecutor,
      systemPrompt: this.systemPrompt,
      sessionContext,
      userProfile,
      targetLanguage: this.detectedLanguage !== 'en' ? this.detectedLanguage : undefined
    }

    const output = await this.core.process(coreInput)

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

    if (this.store) {
      this.store.saveTurn({
        userId: this.userId,
        sessionId: this.sessionId,
        userMessage: message,
        ezioResponse: finalResponse,
        toolsUsed: output.stepResults.map(s => s.tool),
        toolResults: output.stepResults.map(s => ({
          tool: s.tool,
          result: s.rawResult.slice(0, 500)
        })),
        turnIndex: this.turnIndex++,
        timestamp: Date.now()
      })
    }

    if (this.factExtractor) {
      const extraction = this.factExtractor
        .extract(this.userId, message, finalResponse)
        .catch(e => logger.warn('FactExtractor error:', String(e)))

      if (process.env.EZIO_DEBUG === 'true') {
        await extraction
      }
    }

    if (
      this.compressor &&
      this.store &&
      this.history.length >= this.compressEveryN * 2
    ) {
      const historyToCompress = this.history.slice(0, -4)
      const lastTurns = this.history.slice(-4)

      const compressionPromise = this.compressor
        .compress(this.userId, this.sessionId, historyToCompress)
        .then(snapshot => {
          if (snapshot) {
            this.currentSnapshot = snapshot
            this.history = lastTurns
            logger.debug('History compressed, keeping last 2 turns')
          }
        })
        .catch(e => logger.warn('Compression error:', String(e)))

      if (process.env.EZIO_DEBUG === 'true') {
        await compressionPromise
      }
    }

    return { ...output, response: finalResponse }
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  loadSession(sessionId: string): void {
    if (!this.store) return
    this.sessionId = sessionId
    const turns = this.store.getTurns(this.userId, sessionId, 20)
    this.history = turns.flatMap(t => [
      { role: 'user' as const, content: t.userMessage },
      { role: 'assistant' as const, content: t.ezioResponse }
    ])
    this.turnIndex = turns.length
  }

  getSessionId(): string {
    return this.sessionId
  }

  getFacts(): Fact[] {
    return this.factsStore?.getAllFacts(this.userId) ?? []
  }
}
