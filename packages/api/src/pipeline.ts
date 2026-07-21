import type { ModelAdapter, ChatMessage } from '@ezio/core'
import { Classifier, getCurrentDateContext, createLogger } from '@ezio/core'
import { ToolRetriever } from '@ezio/core'
import { FormVerifier } from './FormVerifier.js'
import { reasonPhase, serializePhase } from './reasoning.js'
import type { AnthropicToolSchema } from './types.js'
import { toInternalTools, backToExternalTools } from './toolMapping.js'
import { pruneHistory } from './historyPruning.js'

const logger = createLogger('Pipeline')

const TOOL_RETRIEVAL_THRESHOLD = 12

export interface MessagesRequest {
  system?: string
  messages: ChatMessage[]
  tools?: AnthropicToolSchema[]
  max_tokens?: number
}

export interface MessagesResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  >
}

function getLastUserTurn(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content
    }
  }
  return ''
}

export async function runPipeline(
  adapter: ModelAdapter,
  request: MessagesRequest
): Promise<MessagesResponse> {
  const startTotal = Date.now()
  const tools = request.tools ?? []
  const system = request.system ?? 'You are a helpful assistant.'

  const t0Prune = Date.now()
  const pruneResult = await pruneHistory(adapter, request.messages)
  const effectiveSystem = pruneResult.summary
    ? `${system}\n\n${pruneResult.summary}`
    : system
  const lastUserTurn = getLastUserTurn(pruneResult.messages)
  logger.info('pruneHistory', {
    messagesIn: request.messages.length,
    messagesOut: pruneResult.messages.length,
    summaryApplied: pruneResult.summary !== null,
    ms: Date.now() - t0Prune
  })

  logger.info('request recibida', { messageCount: request.messages.length, toolCount: tools.length })

  const classifier = new Classifier(adapter)
  const t0 = Date.now()
  const classification = await classifier.classify(
    lastUserTurn,
    undefined,
    getCurrentDateContext()
  )
  logger.info('classifier', { level: classification.level, ms: Date.now() - t0 })

  if (classification.level === 'simple') {
    const t0 = Date.now()
    const response = await adapter.complete([
      { role: 'system', content: effectiveSystem },
      ...pruneResult.messages
    ], { temperature: 0.7, maxTokens: request.max_tokens })
    logger.info('camino simple, respuesta directa', { ms: Date.now() - t0 })
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return { content: [{ type: 'text', text: response }] }
  }

  let filteredTools = tools
  if (request.tools && request.tools.length > TOOL_RETRIEVAL_THRESHOLD) {
    const internalTools = toInternalTools(request.tools)
    const retriever = new ToolRetriever(adapter, internalTools)
    const selected = await retriever.retrieve(lastUserTurn, 5)
    filteredTools = backToExternalTools(selected, request.tools)
    logger.info('tool filtering applied', { toolsIn: request.tools.length, toolsOut: filteredTools.length })
  }

  const t0Reason = Date.now()
  const reasonText = await reasonPhase(adapter, effectiveSystem, pruneResult.messages, filteredTools)
  logger.info('reasonPhase', { ms: Date.now() - t0Reason, preview: reasonText.slice(0, 100) })

  const t0Serialize = Date.now()
  const serialized = await serializePhase(adapter, reasonText, filteredTools)
  logger.info('serializePhase', { ms: Date.now() - t0Serialize, tool: serialized?.tool ?? 'ninguna' })

  if (!serialized) {
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return { content: [{ type: 'text', text: reasonText }] }
  }

  const verifier = new FormVerifier(adapter)
  const proposal = { name: serialized.tool, input: serialized.input }
  const t0Verify = Date.now()
  const verifyResult = await verifier.verify(proposal, filteredTools, lastUserTurn)
  logger.info('formVerifier', { ms: Date.now() - t0Verify, approved: verifyResult.approved, costLLM: verifyResult.costLLM })

  if (verifyResult.approved) {
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return { content: [{ type: 'tool_use', name: serialized.tool, input: serialized.input }] }
  }

  logger.warn('retry disparado', { reason: verifyResult.reason })

  const retryReasonText = await reasonPhase(
    adapter,
    `${effectiveSystem}\n\nPrevious verification failed: ${verifyResult.reason}\n\nRevise your reasoning.`,
    pruneResult.messages,
    filteredTools
  )

  const retrySerialized = await serializePhase(adapter, retryReasonText, filteredTools)

  if (!retrySerialized) {
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return { content: [{ type: 'text', text: retryReasonText }] }
  }

  const retryProposal = { name: retrySerialized.tool, input: retrySerialized.input }
  const retryVerify = await verifier.verify(retryProposal, filteredTools, lastUserTurn)

  if (!retryVerify.approved) {
    throw new Error(`Verification rejected after retry: ${retryVerify.reason}`)
  }

  logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
  return { content: [{ type: 'tool_use', name: retrySerialized.tool, input: retrySerialized.input }] }
}
