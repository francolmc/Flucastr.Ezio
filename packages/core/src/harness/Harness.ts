import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Tool, ToolRegistry, StepResult } from '../types/index'
import { ToolRetriever } from '../planner/ToolRetriever'
import { buildDoneCheckPrompt, buildStepReasonPrompt, buildSerializePrompt, buildSummaryPrompt } from './prompts'
import { createLogger } from '../utils/Logger'
import { WorkingMemory } from './WorkingMemory'
import { WorkingState } from './WorkingState'

export class Harness {
  private logger = createLogger('Harness')

  constructor(private adapter: ModelAdapter) {}

  async run(
    objective: string,
    baseContext: {
      systemPromptBase: string
      classification: string
      targetLanguage?: string
      systemContext?: string
    },
    toolRegistry: ToolRegistry,
    allTools: Tool[],
    maxSteps = 15
  ): Promise<{ results: StepResult[], workingState: WorkingStateData }> {
    const results: StepResult[] = []
    const workingMemory = new WorkingMemory()
    const workingState = new WorkingState(objective)
    const memoryTools = workingMemory.getTools()
    const allToolsWithMemory = [...allTools, ...memoryTools]

    let previousStepResult: string | null = null
    let stepId = 1

    while (stepId <= maxSteps) {
      const doneResponse = await this.adapter.complete([
        {
          role: 'system',
          content: buildDoneCheckPrompt(objective, previousStepResult, workingState.toPromptBlock())
        },
        { role: 'user', content: 'Is the objective done?' }
      ], { temperature: 0 }).catch(() => 'NO')

      this.logger.debug(`step ${stepId} done check: ${doneResponse.slice(0, 100)}`)

      if (doneResponse.trim().toUpperCase().startsWith('YES')) {
        this.logger.info(`Objective accomplished after ${stepId - 1} steps`)
        break
      }

      const reasonResponse = await this.adapter.complete([
        {
          role: 'system',
          content: buildStepReasonPrompt(
            objective,
            baseContext.systemPromptBase,
            allToolsWithMemory,
            previousStepResult,
            workingState.toPromptBlock(),
            workingMemory.toContext(),
            baseContext.systemContext
          )
        },
        {
          role: 'user',
          content: previousStepResult
            ? `Previous result: ${previousStepResult}\nWhat is the next action?`
            : `Start working on: ${objective}`
        }
      ], { temperature: 0 }).catch(() => null)

      if (!reasonResponse) {
        this.logger.warn(`step ${stepId} ReasonPhase failed`)
        results.push({
          subtaskId: stepId,
          summary: `Step ${stepId}: failed to determine action`,
          tool: '',
          rawResult: '',
          toolInput: {},
          status: 'failed',
          failReason: 'ReasonPhase failed'
        })
        break
      }

      this.logger.debug(`step ${stepId} reason:\n${reasonResponse.slice(0, 300)}`)

      const retriever = new ToolRetriever(this.adapter, allToolsWithMemory)
      const retrieved = await retriever.retrieve(reasonResponse, 3)
      const toolsForStep = retrieved.length > 0
        ? retrieved
        : allToolsWithMemory.slice(0, 5)

      this.logger.debug(`step ${stepId} tools:`, toolsForStep.map(t => t.name))

      const serializeResponse = await this.adapter.complete([
        { role: 'system', content: buildSerializePrompt(reasonResponse, toolsForStep) },
        { role: 'user', content: 'Produce the JSON tool call.' }
      ], { temperature: 0 }).catch(() => null)

      this.logger.debug(`step ${stepId} serialize raw:\n${serializeResponse?.slice(0, 300)}`)

      const serialized = serializeResponse ? this.parseJson(serializeResponse) : null
      this.logger.debug(`step ${stepId} parsed:`, JSON.stringify(serialized))

      if (!serialized) {
        this.logger.warn(`step ${stepId} failed to serialize`)
        results.push({
          subtaskId: stepId,
          summary: `Step ${stepId}: failed to determine action`,
          tool: '',
          rawResult: reasonResponse,
          toolInput: {},
          status: 'failed',
          failReason: 'SerializePhase failed'
        })
        break
      }

      const { tool: toolName, input: toolInput } = serialized

      const lastResult = results[results.length - 1]
      if (
        lastResult &&
        lastResult.tool === toolName &&
        JSON.stringify(lastResult.toolInput) === JSON.stringify(toolInput)
      ) {
        this.logger.warn(`step ${stepId} loop detected — same tool+input, stopping`)
        break
      }

      let rawResult: string
      if (workingMemory.isTool(toolName)) {
        rawResult = workingMemory.executeTool(toolName, toolInput)
      } else {
        try {
          rawResult = await toolRegistry.callTool(toolName, toolInput)
        } catch (err) {
          rawResult = err instanceof Error ? err.message : String(err)
        }
      }

      workingState.update(toolName, toolInput, rawResult, stepId)

      this.logger.debug(`step ${stepId} tool=${toolName} result:\n${rawResult.slice(0, 200)}`)

      const summaryResponse = await this.adapter.complete([
        {
          role: 'system',
          content: buildSummaryPrompt(
            stepId,
            toolName,
            rawResult,
            toolInput,
            baseContext.targetLanguage
          )
        },
        { role: 'user', content: 'Summarize the result above.' }
      ], { temperature: 0 }).catch(
        () => `Step ${stepId} (${toolName}): completed`
      )

      this.logger.debug(`step ${stepId} summary:\n${summaryResponse.slice(0, 300)}`)

      const resultLimit = ['list_directory', 'search_files'].includes(toolName)
        ? 20000
        : 2000
      previousStepResult = `Step ${stepId} (${toolName}):\n${rawResult.slice(0, resultLimit)}`

      results.push({
        subtaskId: stepId,
        summary: summaryResponse,
        tool: toolName,
        rawResult,
        toolInput,
        status: 'ok'
      })

      if (stepId > 4) {
        const lastFour = results.slice(-4).map(r => r.tool)
        const progressTools = [
          'memory_set', 'create_directory', 'move_file',
          'write_file', 'delete_file', 'run_command', 'web_search'
        ]
        const hasProgress = lastFour.some(t => progressTools.includes(t))
        if (!hasProgress) {
          this.logger.warn(`No progress in last 4 steps, stopping`)
          break
        }
      }

      stepId++
    }

    if (stepId > maxSteps) {
      this.logger.warn(`Reached maxSteps (${maxSteps}) without completion`)
    }

    return { results, workingState: workingState.getData() }
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
            try {
              const repaired = candidate
                .replace(/:\s*\[([^\]]*)\]/g, (_match: string, arr: string) => {
                  const fixed = arr
                    .split(',')
                    .map((item: string) => {
                      const trimmed = item.trim()
                      if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
                        return `"${trimmed.replace(/^['"]|['"]$/g, '')}"`
                      }
                      return `"${trimmed}"`
                    })
                    .join(', ')
                  return `: [${fixed}]`
                })
              const reparsed = JSON.parse(repaired)
              if (typeof reparsed.tool === 'string' && reparsed.input) {
                return { tool: reparsed.tool, input: reparsed.input }
              }
            } catch {
              // seguir buscando
            }
          }
          start = -1
        }
      }
    }
    return null
  }
}
