import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Tool, ToolRegistry, Subtask, StepResult, HarnessContext } from '../types/index'
import { Verifier } from './Verifier'
import { ToolRetriever } from '../planner/ToolRetriever'
import { buildReasonPrompt, buildSerializePrompt, buildSummaryPrompt } from './prompts'
import { createLogger } from '../utils/Logger'

export class Harness {
  private verifier: Verifier
  private logger = createLogger('Harness')

  constructor(private adapter: ModelAdapter) {
    this.verifier = new Verifier(adapter)
  }

  async run(
    subtasks: Subtask[],
    baseContext: Omit<HarnessContext, 'subtask' | 'tools'>,
    toolRegistry: ToolRegistry,
    allTools: Tool[]
  ): Promise<StepResult[]> {
    const results: StepResult[] = []
    const previousSummaries: string[] = []

    for (const subtask of subtasks) {
      const retriever = new ToolRetriever(this.adapter, allTools)
      const retrieved = await retriever.retrieve(subtask.objective, 3)
      const toolsForStep = retrieved.length > 0 ? retrieved : allTools.slice(0, 3)
      this.logger.debug(`subtask ${subtask.id} tools:`, toolsForStep.map(t => t.name))

      const context: HarnessContext = {
        ...baseContext,
        subtask,
        tools: toolsForStep,
      }

      const estimatedPrompt = buildReasonPrompt(context)
      this.logger.debug(`subtask ${subtask.id} tokens: ~${Math.ceil(estimatedPrompt.length / 4)}`)

      let rawReasoning: string
      let status: 'ok' | 'failed' = 'ok'
      let failReason: string | undefined

      let reasonResponse: string | undefined
      try {
        const userContent = previousSummaries.length > 0
          ? `${subtask.objective}\n\nDATA FROM PREVIOUS STEPS:\n${previousSummaries.join('\n')}`
          : subtask.objective

        reasonResponse = await this.adapter.complete([
          { role: 'system', content: buildReasonPrompt(context) },
          { role: 'user', content: userContent }
        ], { temperature: 0 })
      } catch (err) {
        rawReasoning = ''
        reasonResponse = undefined
      }

      if (!reasonResponse) {
        rawReasoning = ''
        status = 'failed'
        failReason = 'ReasonPhase failed'
        results.push({ subtaskId: subtask.id, summary: '', tool: '', rawResult: '', toolInput: {}, status, failReason })
        continue
      }
      rawReasoning = reasonResponse

      this.logger.debug(`subtask ${subtask.id} reasoning:\n${rawReasoning.slice(0, 300)}`)

      let serialized: { tool: string; input: Record<string, unknown> } | null = null
      const serializeResponse = await this.adapter.complete([
        { role: 'system', content: buildSerializePrompt(rawReasoning, toolsForStep) },
        { role: 'user', content: 'Produce the JSON tool call.' }
      ], { temperature: 0 }).catch(() => null)

      this.logger.debug(`subtask ${subtask.id} serialize raw:\n${serializeResponse?.slice(0, 300)}`)

      if (!serializeResponse) {
        const retryResponse = await this.adapter.complete([
          { role: 'system', content: buildSerializePrompt(rawReasoning, toolsForStep) },
          { role: 'user', content: 'CRITICAL: respond with ONLY valid JSON, no additional text.' }
        ], { temperature: 0 }).catch(() => null)

        if (!retryResponse) {
          status = 'failed'
          failReason = 'SerializePhase failed'
          results.push({ subtaskId: subtask.id, summary: '', tool: '', rawResult: rawReasoning, toolInput: {}, status, failReason })
          continue
        }

        serialized = this.parseJson(retryResponse)
      } else {
        serialized = this.parseJson(serializeResponse)
      }

      this.logger.debug(`subtask ${subtask.id} parsed:`, JSON.stringify(serialized))

      if (!serialized) {
        status = 'failed'
        failReason = 'SerializePhase failed to parse JSON'
        results.push({ subtaskId: subtask.id, summary: '', tool: '', rawResult: rawReasoning, toolInput: {}, status, failReason })
        continue
      }

      const { tool: toolName, input: toolInput } = serialized

      let rawResult: string
      try {
        rawResult = await toolRegistry.callTool(toolName, toolInput)
      } catch (err) {
        rawResult = err instanceof Error ? err.message : String(err)
      }

      this.logger.debug(`subtask ${subtask.id} tool=${toolName} result:\n${rawResult.slice(0, 200)}`)

      if (baseContext.classification === 'complex') {
        const verification = await this.verifier.verify(subtask.objective, rawResult)

        if (!verification.approved) {
          const retryReasoning = await this.adapter.complete([
            { role: 'system', content: buildReasonPrompt({
              ...context,
              previousSummaries: [...previousSummaries, `Previous attempt failed: ${verification.reason}`]
            }) },
            { role: 'user', content: subtask.objective }
          ], { temperature: 0 }).catch(() => null)

          if (retryReasoning) {
            const retrySerialize = await this.adapter.complete([
              { role: 'system', content: buildSerializePrompt(retryReasoning, toolsForStep) },
              { role: 'user', content: 'Produce the JSON tool call.' }
            ], { temperature: 0 }).catch(() => null)

            if (retrySerialize) {
              const retryParsed = this.parseJson(retrySerialize)
              if (retryParsed) {
                const retryToolName = retryParsed.tool
                const retryToolInput = retryParsed.input

                try {
                  rawResult = await toolRegistry.callTool(retryToolName, retryToolInput)
                } catch (err) {
                  rawResult = err instanceof Error ? err.message : String(err)
                }

                const retryVerification = await this.verifier.verify(subtask.objective, rawResult)
                if (!retryVerification.approved) {
                  status = 'failed'
                  failReason = retryVerification.reason
                }
              }
            }
          }

          if (status !== 'failed') {
            const retryVerification = await this.verifier.verify(subtask.objective, rawResult)
            if (!retryVerification.approved) {
              status = 'failed'
              failReason = verification.reason
            }
          }
        }
      }

      const summaryResponse = await this.adapter.complete([
        { role: 'system', content: buildSummaryPrompt(subtask.id, toolName, rawResult, toolInput, baseContext.targetLanguage) },
        { role: 'user', content: 'Summarize the result above.' }
      ], { temperature: 0 }).catch(() => `Step ${subtask.id} (${toolName}): completed`)

      previousSummaries.push(summaryResponse)
      this.logger.debug(`subtask ${subtask.id} summary:\n${summaryResponse.slice(0, 400)}`)

      results.push({
        subtaskId: subtask.id,
        summary: summaryResponse,
        tool: toolName,
        rawResult,
        toolInput,
        status,
        failReason,
      })
    }

    return results
  }

  private parseJson(
    response: string
  ): { tool: string; input: Record<string, unknown> } | null {
    let text = response
      .replace(/```json[\s\S]*?```/g, m =>
        m.replace(/```json\s*/i, '').replace(/```$/, '')
      )
      .replace(/```[\s\S]*?```/g, m =>
        m.replace(/```\s*/, '').replace(/```$/, '')
      )

    let depth = 0
    let start = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i
        depth++
      } else if (text[i] === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          const candidate = text.slice(start, i + 1)
          try {
            const parsed = JSON.parse(candidate)
            if (
              typeof parsed.tool === 'string' &&
              parsed.tool.length > 0 &&
              parsed.input !== undefined &&
              typeof parsed.input === 'object'
            ) {
              return { tool: parsed.tool, input: parsed.input }
            }
          } catch {
            // seguir buscando
          }
          start = -1
        }
      }
    }
    return null
  }
}
