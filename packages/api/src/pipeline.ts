import type { ModelAdapter, ChatMessage, RitosService } from '@ezio/core'
import { Classifier, getCurrentDateContext, createLogger } from '@ezio/core'
import { BM25ToolSelector } from '@ezio/core'
import { FormVerifier } from './FormVerifier.js'
import { reasonPhase, serializePhase } from './reasoning.js'
import type { AnthropicToolSchema } from './types.js'
import { toInternalTools, backToExternalTools } from './toolMapping.js'
import { pruneHistory } from './historyPruning.js'
import { lookupPattern, recordPattern } from './ritosCache.js'
import { randomUUID } from 'node:crypto'

const logger = createLogger('Pipeline')

const TOOL_TOKEN_THRESHOLD = 4000
const DEFAULT_NUM_CTX = 8192

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface MessagesRequest {
  system?: string
  messages: ChatMessage[]
  tools?: AnthropicToolSchema[]
  max_tokens?: number
  stream?: boolean
}

export interface MessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
  stop_sequence: null
  usage: { input_tokens: number; output_tokens: number }
}

function buildResponse(
  model: string,
  content: MessagesResponse['content'],
  stopReason: MessagesResponse['stop_reason']
): MessagesResponse {
  const textContent = content.find(c => c.type === 'text')
  const textLength = textContent?.text?.length ?? 0
  const inputTokens = 0
  const outputTokens = Math.round(textLength / 4)

  return {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens }
  }
}

export async function runPipeline(
  adapter: ModelAdapter,
  request: MessagesRequest,
  ritos: RitosService,
  userId: string,
  model: string,
  lastUserTurn: string
): Promise<MessagesResponse> {
  const startTotal = Date.now()
  const tools = request.tools ?? []
  const system = request.system ?? 'You are a helpful assistant.'

  const t0Prune = Date.now()
  const pruneResult = await pruneHistory(adapter, request.messages)
  const lookup = lookupPattern(ritos, userId, lastUserTurn)
  let effectiveSystem = pruneResult.summary
    ? `${system}\n\n${pruneResult.summary}`
    : system
  if (lookup.found && lookup.guiaText) {
    effectiveSystem = `${effectiveSystem}\n\n${lookup.guiaText}`
  }
  logger.info('ritosLookup', { found: lookup.found, similarity: lookup.similarity })
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
    ], { temperature: 0.7, maxTokens: request.max_tokens, numCtx: DEFAULT_NUM_CTX })
    logger.info('camino simple, respuesta directa', { ms: Date.now() - t0 })
    const resultSummary = response.length > 150 ? response.slice(0, 150) : response
    const guia = 'Respuesta directa sin tool, clasificación simple'
    await recordPattern(ritos, userId, lastUserTurn, [], resultSummary, guia)
    logger.info('ritosSave', { saved: true, toolsProposed: [] })
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return buildResponse(model, [{ type: 'text', text: response }], 'end_turn')
  }

  let filteredTools = tools
  const toolsJson = JSON.stringify(tools)
  const toolsTokenEstimate = estimateTokens(toolsJson)
  if (request.tools && toolsTokenEstimate > TOOL_TOKEN_THRESHOLD) {
    logger.debug('tool filtering triggered', { toolCount: request.tools.length, tokenEstimate: toolsTokenEstimate })
    const internalTools = toInternalTools(request.tools)
    const selector = new BM25ToolSelector()
    const selected = selector.select(lastUserTurn, internalTools, 5)
    filteredTools = backToExternalTools(selected, request.tools)
    logger.info('tool filtering applied', { toolsIn: request.tools.length, toolsOut: filteredTools.length, selected: filteredTools.map(t => t.name) })
  }

  const t0Reason = Date.now()
  const reasonText = await reasonPhase(adapter, effectiveSystem, pruneResult.messages, filteredTools, DEFAULT_NUM_CTX)
  logger.info('reasonPhase', { ms: Date.now() - t0Reason, preview: reasonText.slice(0, 100) })

  const t0Serialize = Date.now()
  const serialized = await serializePhase(adapter, reasonText, filteredTools, DEFAULT_NUM_CTX)
  logger.info('serializePhase', { ms: Date.now() - t0Serialize, tool: serialized?.tool ?? 'ninguna' })

  if (!serialized) {
    const resultSummary = reasonText.length > 150 ? reasonText.slice(0, 150) : reasonText
    const guia = reasonText.length > 300 ? reasonText.slice(0, 300) : reasonText
    await recordPattern(ritos, userId, lastUserTurn, [], resultSummary, guia)
    logger.info('ritosSave', { saved: true, toolsProposed: [] })
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return buildResponse(model, [{ type: 'text', text: reasonText }], 'end_turn')
  }

  const verifier = new FormVerifier(adapter)
  const proposal = { name: serialized.tool, input: serialized.input }
  const conversationHistory = pruneResult.messages
    .map(m => `${m.role === 'user' ? 'User' : 'Ezio'}: ${m.content}`)
    .join('\n')
    .slice(-2000)
  const t0Verify = Date.now()
  const verifyResult = await verifier.verify(proposal, filteredTools, lastUserTurn, conversationHistory)
  logger.info('formVerifier', { ms: Date.now() - t0Verify, approved: verifyResult.approved, costLLM: verifyResult.costLLM, reason: verifyResult.reason })

  if (verifyResult.approved) {
    const toolsProposed = [proposal.name]
    const resultSummary = `Propuso ${proposal.name} con input ${JSON.stringify(proposal.input)}`
    const guia = reasonText.length > 300 ? reasonText.slice(0, 300) : reasonText
    await recordPattern(ritos, userId, lastUserTurn, toolsProposed, resultSummary, guia)
    logger.info('ritosSave', { saved: true, toolsProposed })
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return buildResponse(model, [{ type: 'tool_use', id: `tool_${randomUUID()}`, name: serialized.tool, input: serialized.input }], 'tool_use')
  }

  logger.warn('retry disparado', { reason: verifyResult.reason })

  if (verifyResult.failureType === 'quantity' && verifyResult.quantityDetails?.textFieldKey) {
    const fieldKey = verifyResult.quantityDetails.textFieldKey
    const rejectedContent = typeof proposal.input[fieldKey] === 'string' ? proposal.input[fieldKey] as string : ''

    const retrySystemSupplement = `Previous verification failed: your last response had ${verifyResult.quantityDetails.actualWords} words, but at least ${verifyResult.quantityDetails.requiredWords} words are required.

Here is the content you previously wrote:
"""
${rejectedContent}
"""

Expand this exact content with more detail, explanation, and examples until it reaches the minimum word count. Do not summarize or shorten it, and do not start over from scratch. Respond with ONLY the expanded content itself — no preamble, no explanation, no tool names.`

    const expandedContent = await reasonPhase(
      adapter,
      `${effectiveSystem}\n\n${retrySystemSupplement}`,
      pruneResult.messages,
      filteredTools,
      DEFAULT_NUM_CTX
    )

    const retryProposal = {
      name: proposal.name,
      input: { ...proposal.input, [fieldKey]: expandedContent.trim() }
    }
    const retryVerify = await verifier.verify(retryProposal, filteredTools, lastUserTurn, conversationHistory)

    if (!retryVerify.approved) {
      throw new Error(`Verification rejected after retry: ${retryVerify.reason}`)
    }

    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    const toolsProposed = [retryProposal.name]
    const resultSummary = `Propuso ${retryProposal.name} con input ${JSON.stringify(retryProposal.input)}`
    const guia = expandedContent.length > 300 ? expandedContent.slice(0, 300) : expandedContent
    await recordPattern(ritos, userId, lastUserTurn, toolsProposed, resultSummary, guia)
    logger.info('ritosSave', { saved: true, toolsProposed })
    return buildResponse(model, [{ type: 'tool_use', id: `tool_${randomUUID()}`, name: retryProposal.name, input: retryProposal.input }], 'tool_use')
  }

  const retrySystemSupplement = `Previous verification failed: ${verifyResult.reason}\n\nRevise your reasoning.`

  const retryReasonText = await reasonPhase(
    adapter,
    `${effectiveSystem}\n\n${retrySystemSupplement}`,
    pruneResult.messages,
    filteredTools,
    DEFAULT_NUM_CTX
  )

  const retrySerialized = await serializePhase(adapter, retryReasonText, filteredTools, DEFAULT_NUM_CTX)

  if (!retrySerialized) {
    const resultSummary = retryReasonText.length > 150 ? retryReasonText.slice(0, 150) : retryReasonText
    const guia = retryReasonText.length > 300 ? retryReasonText.slice(0, 300) : retryReasonText
    await recordPattern(ritos, userId, lastUserTurn, [], resultSummary, guia)
    logger.info('ritosSave', { saved: true, toolsProposed: [] })
    logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
    return buildResponse(model, [{ type: 'text', text: retryReasonText }], 'end_turn')
  }

  const retryProposal = { name: retrySerialized.tool, input: retrySerialized.input }
  const retryVerify = await verifier.verify(retryProposal, filteredTools, lastUserTurn, conversationHistory)

  if (!retryVerify.approved) {
    throw new Error(`Verification rejected after retry: ${retryVerify.reason}`)
  }

  logger.info('pipeline completo', { msTotal: Date.now() - startTotal })
  const toolsProposed = [retryProposal.name]
  const resultSummary = `Propuso ${retryProposal.name} con input ${JSON.stringify(retryProposal.input)}`
  const guia = retryReasonText.length > 300 ? retryReasonText.slice(0, 300) : retryReasonText
  await recordPattern(ritos, userId, lastUserTurn, toolsProposed, resultSummary, guia)
  logger.info('ritosSave', { saved: true, toolsProposed })
  return buildResponse(model, [{ type: 'tool_use', id: `tool_${randomUUID()}`, name: retrySerialized.tool, input: retrySerialized.input }], 'tool_use')
}
