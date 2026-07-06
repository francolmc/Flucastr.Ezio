import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Tool, ToolRegistry, Subtask, StepResult, HarnessContext } from '../types/index'
import { Verifier } from './Verifier'
import { buildReasonPrompt, buildSerializePrompt, buildSummaryPrompt } from './prompts'

export class Harness {
  private verifier: Verifier

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
      const context: HarnessContext = {
        ...baseContext,
        subtask,
        tools: allTools,
      }

      const estimatedPrompt = buildReasonPrompt(context)
      console.warn(`[Harness] subtask ${subtask.id} tokens: ~${Math.ceil(estimatedPrompt.length / 4)}`)

      let rawReasoning: string
      let status: 'ok' | 'failed' = 'ok'
      let failReason: string | undefined

      let reasonResponse: string | undefined
      try {
        reasonResponse = await this.adapter.complete([{ role: 'user', content: buildReasonPrompt(context) }])
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

      if (process.env.EZIO_DEBUG === 'true') {
        console.warn(`[Harness] subtask ${subtask.id} reasoning:\n${rawReasoning.slice(0, 300)}`)
      }

      let serialized: { tool: string; input: Record<string, unknown> } | null = null
      const serializeResponse = await this.adapter.complete([
        { role: 'user', content: buildSerializePrompt(rawReasoning, allTools) }
      ]).catch(() => null)

      if (process.env.EZIO_DEBUG === 'true') {
        console.warn(`[Harness] subtask ${subtask.id} serialize raw:\n${serializeResponse?.slice(0, 300)}`)
      }

      if (!serializeResponse) {
        const retryResponse = await this.adapter.complete([
          { role: 'user', content: buildSerializePrompt(rawReasoning, allTools) + '\n\nCRITICAL: respond with ONLY valid JSON, no additional text.' }
        ]).catch(() => null)

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

      if (process.env.EZIO_DEBUG === 'true') {
        console.warn(`[Harness] subtask ${subtask.id} parsed:`, JSON.stringify(serialized))
      }

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

      if (process.env.EZIO_DEBUG === 'true') {
        console.warn(`[Harness] subtask ${subtask.id} tool=${toolName} result:\n${rawResult.slice(0, 200)}`)
      }

      if (baseContext.classification === 'complex') {
        const verification = await this.verifier.verify(subtask.objective, rawResult)

        if (!verification.approved) {
          const retryReasoning = await this.adapter.complete([
            { role: 'user', content: buildReasonPrompt({
              ...context,
              previousSummaries: [...previousSummaries, `Previous attempt failed: ${verification.reason}`]
            }) }
          ]).catch(() => null)

          if (retryReasoning) {
            const retrySerialize = await this.adapter.complete([
              { role: 'user', content: buildSerializePrompt(retryReasoning, allTools) }
            ]).catch(() => null)

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
        { role: 'user', content: buildSummaryPrompt(subtask.id, toolName, rawResult, toolInput) }
      ]).catch(() => `Step ${subtask.id} (${toolName}): completed`)

      previousSummaries.push(summaryResponse)

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
