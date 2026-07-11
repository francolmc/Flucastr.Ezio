import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Tool, ToolRegistry, StepResult } from '../types/index'
import { ToolRetriever } from '../planner/ToolRetriever'
import { buildDoneCheckPrompt, buildStepReasonPrompt, buildFusedReasonPrompt, buildSerializePrompt, buildSummaryPrompt, buildDecomposePrompt } from './prompts'
import { createLogger } from '../utils/Logger'
import { WorkingMemory } from './WorkingMemory'
import { WorkingState } from './WorkingState'
import { Verifier } from './Verifier'

export interface HarnessOptions {
  maxReactiveDecomposePerRun?: number
  toolRetrievalThreshold?: number
  maxWebSearchPerRun?: number
}

export class Harness {
  private logger = createLogger('Harness')
  private verifier: Verifier
  private toolRetrievalThreshold = 12
  private maxWebSearchPerRun = 5

  constructor(private adapter: ModelAdapter, private options: HarnessOptions = {}) {
    this.verifier = new Verifier(adapter)
    if (options.toolRetrievalThreshold !== undefined) {
      this.toolRetrievalThreshold = options.toolRetrievalThreshold
    }
    if (options.maxWebSearchPerRun !== undefined) {
      this.maxWebSearchPerRun = options.maxWebSearchPerRun
    }
  }

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
    const retriedSteps = new Set<number>()
    let isRetrying = false
    let rejectionContext: string | undefined
    const webSearchCache = new Map<string, string>()
    let webSearchCallCount = 0

    let microQueue: string[] = []
    let reactiveDecomposeCount = 0
    const maxReactiveDecomposePerRun = this.options.maxReactiveDecomposePerRun ?? 1
    let stepFocus = objective
    let skipNoProgressUntilStepId = 0

    const tryReactiveDecompose = async (stuckReason: string): Promise<boolean> => {
      if (reactiveDecomposeCount >= maxReactiveDecomposePerRun) {
        this.logger.warn(`[Harness] reactive decompose budget exhausted (${reactiveDecomposeCount}/${maxReactiveDecomposePerRun}), stopping`)
        return false
      }
      const decomposeResponse = await this.adapter.complete([
        { role: 'system', content: buildDecomposePrompt(stepFocus, workingState.toPromptBlock(), stuckReason) },
        { role: 'user', content: 'Break this down.' }
      ], { temperature: 0 }).catch(() => null)

      const microSteps = decomposeResponse ? this.parseMicroSteps(decomposeResponse) : []

      if (microSteps.length === 0) {
        this.logger.warn(`[Harness] reactive decompose produced no usable steps, stopping`)
        return false
      }

      reactiveDecomposeCount++
      microQueue.unshift(...microSteps)
      this.logger.info(`[Harness] stuck on "${stepFocus}", reactive decompose → ${microSteps.length} micro-steps`)
      skipNoProgressUntilStepId = stepId + 1
      return true
    }

    while (stepId <= maxSteps) {
      if (!isRetrying) {
        stepFocus = microQueue.length > 0 ? microQueue.shift()! : objective
      }

      const isMicroStep = stepFocus !== objective
      let reasonResponse: string | null = null

      if (isRetrying) {
        isRetrying = false
        reasonResponse = await this.adapter.complete([
          { role: 'system', content: buildStepReasonPrompt(stepFocus, baseContext.systemPromptBase, allToolsWithMemory, previousStepResult, workingState.toPromptBlock(), workingMemory.toContext(), baseContext.systemContext, rejectionContext) },
          { role: 'user', content: previousStepResult ? `Previous result: ${previousStepResult}\nWhat is the next action?` : `Start working on: ${stepFocus}` }
        ], { temperature: 0 }).catch(() => null)

      } else if (isMicroStep) {
        reasonResponse = await this.adapter.complete([
          { role: 'system', content: buildStepReasonPrompt(stepFocus, baseContext.systemPromptBase, allToolsWithMemory, previousStepResult, workingState.toPromptBlock(), workingMemory.toContext(), baseContext.systemContext, rejectionContext) },
          { role: 'user', content: previousStepResult ? `Previous result: ${previousStepResult}\nWhat is the next action?` : `Start working on: ${stepFocus}` }
        ], { temperature: 0 }).catch(() => null)

      } else if (stepId === 1) {
        const doneResponse = await this.adapter.complete([
          { role: 'system', content: buildDoneCheckPrompt(objective, previousStepResult, workingState.toPromptBlock()) },
          { role: 'user', content: 'Is the objective done?' }
        ], { temperature: 0 }).catch(() => 'NO')
        this.logger.debug(`step ${stepId} done check: ${doneResponse.slice(0, 100)}`)
        if (doneResponse.trim().toUpperCase().startsWith('YES')) {
          this.logger.info(`Objective accomplished after ${stepId - 1} steps`)
          break
        }
        reasonResponse = await this.adapter.complete([
          { role: 'system', content: buildStepReasonPrompt(stepFocus, baseContext.systemPromptBase, allToolsWithMemory, previousStepResult, workingState.toPromptBlock(), workingMemory.toContext(), baseContext.systemContext, rejectionContext) },
          { role: 'user', content: `Start working on: ${stepFocus}` }
        ], { temperature: 0 }).catch(() => null)

      } else {
        const fusedResponse = await this.adapter.complete([
          { role: 'system', content: buildFusedReasonPrompt(objective, stepFocus, baseContext.systemPromptBase, allToolsWithMemory, previousStepResult, workingState.toPromptBlock(), workingMemory.toContext(), baseContext.systemContext, rejectionContext) },
          { role: 'user', content: previousStepResult ? `Previous result: ${previousStepResult}\nWhat is the next action?` : `Start working on: ${stepFocus}` }
        ], { temperature: 0 }).catch(() => null)

        if (fusedResponse) {
          const firstLine = fusedResponse.split('\n')[0].trim().toUpperCase()
          if (firstLine.startsWith('STATUS: YES')) {
            this.logger.info(`Objective accomplished after ${stepId - 1} steps`)
            break
          }
          reasonResponse = fusedResponse.split('\n').slice(1).join('\n').trim()
        }
      }

      rejectionContext = undefined

      if (!reasonResponse) {
        if (!retriedSteps.has(stepId)) {
          retriedSteps.add(stepId)
          rejectionContext = 'Your previous attempt failed to produce a response. Try again with a clear, single next action.'
          isRetrying = true
          this.logger.warn(`step ${stepId} ReasonPhase failed, retrying`)
          continue
        }
        this.logger.warn(`step ${stepId} ReasonPhase failed after retry, marking failed`)
        results.push({
          subtaskId: stepId,
          summary: `Step ${stepId}: failed to determine action`,
          tool: '',
          rawResult: '',
          toolInput: {},
          status: 'failed',
          failReason: 'ReasonPhase failed',
          retried: true,
          microStep: stepFocus !== objective
        })
        stepId++
        continue
      }

      this.logger.debug(`step ${stepId} reason:\n${reasonResponse.slice(0, 300)}`)

      const toolsForStep = allToolsWithMemory.length <= this.toolRetrievalThreshold
        ? allToolsWithMemory
        : await new ToolRetriever(this.adapter, allToolsWithMemory)
            .retrieve(reasonResponse, 3)
            .then(r => r.length > 0 ? r : allToolsWithMemory.slice(0, 5))

      this.logger.debug(`step ${stepId} tools: skip-retriever=${allToolsWithMemory.length <= this.toolRetrievalThreshold}, count=${toolsForStep.length}`)

      const serializeResponse = await this.adapter.complete([
        { role: 'system', content: buildSerializePrompt(reasonResponse, toolsForStep) },
        { role: 'user', content: 'Produce the JSON tool call.' }
      ], { temperature: 0 }).catch(() => null)

      this.logger.debug(`step ${stepId} serialize raw:\n${serializeResponse?.slice(0, 300)}`)

      const serialized = serializeResponse ? this.parseJson(serializeResponse) : null
      this.logger.debug(`step ${stepId} parsed:`, JSON.stringify(serialized))

      if (!serialized) {
        if (!retriedSteps.has(stepId)) {
          retriedSteps.add(stepId)
          rejectionContext = 'Your previous response could not be converted into valid JSON. Provide ONE clear action with SIMPLE parameter values — for example, a single string for "query", not multiple concatenated strings or arrays where a string is expected.'
          isRetrying = true
          this.logger.warn(`step ${stepId} failed to serialize, retrying`)
          continue
        }
        this.logger.warn(`step ${stepId} failed to serialize after retry, marking failed`)
        results.push({
          subtaskId: stepId,
          summary: `Step ${stepId}: failed to determine action`,
          tool: '',
          rawResult: reasonResponse,
          toolInput: {},
          status: 'failed',
          failReason: 'SerializePhase failed',
          retried: true,
          microStep: stepFocus !== objective
        })
        stepId++
        continue
      }

      const { tool: toolName, input: toolInput } = serialized

      const lastResult = results[results.length - 1]
      if (
        lastResult &&
        lastResult.tool === toolName &&
        JSON.stringify(lastResult.toolInput) === JSON.stringify(toolInput)
      ) {
        const recovered = await tryReactiveDecompose('same tool+input repeated')
        if (recovered) {
          continue
        }
        break
      }

      let rawResult: string
      const cacheKey = toolName === 'web_search' ? JSON.stringify(toolInput) : null

      if (cacheKey && webSearchCache.has(cacheKey)) {
        rawResult = webSearchCache.get(cacheKey)!
        this.logger.debug(`step ${stepId} web_search cache hit, skipping real call`)
      } else if (toolName === 'web_search' && webSearchCallCount >= this.maxWebSearchPerRun) {
        rawResult = `Error: web_search budget exhausted for this run (${this.maxWebSearchPerRun} real calls used). Use the information already gathered in the WORKING STATE to answer, or tell the user the search budget ran out.`
        this.logger.warn(`step ${stepId} web_search budget exhausted (${webSearchCallCount}/${this.maxWebSearchPerRun}), blocking real call`)
      } else if (workingMemory.isTool(toolName)) {
        rawResult = workingMemory.executeTool(toolName, toolInput)
      } else {
        try {
          rawResult = await toolRegistry.callTool(toolName, toolInput)
        } catch (err) {
          rawResult = err instanceof Error ? err.message : String(err)
        }
        if (toolName === 'web_search') webSearchCallCount++
        if (cacheKey) webSearchCache.set(cacheKey, rawResult)
      }

      workingState.update(toolName, toolInput, rawResult, stepId)

      this.logger.debug(`step ${stepId} tool=${toolName} result:\n${rawResult.slice(0, 200)}`)

      const grounded = workingState.confirms(stepFocus, toolName, toolInput)
      let approved: boolean
      let verifyReason: string | undefined
      let costLLM = false

      if (grounded === 'confirmed') {
        approved = true
      } else {
        const verifierResult = await this.verifier.verify(stepFocus, rawResult)
        approved = verifierResult.approved
        verifyReason = verifierResult.reason
        costLLM = true
      }

      this.logger.debug(`step ${stepId} verify: grounded=${grounded === 'confirmed'}, approved=${approved}`)

      if (!approved) {
        if (!retriedSteps.has(stepId)) {
          retriedSteps.add(stepId)
          rejectionContext = verifyReason
          isRetrying = true
          continue
        } else {
          previousStepResult = `Step ${stepId} failed: ${verifyReason}`
          results.push({
            subtaskId: stepId,
            summary: `Step ${stepId}: verification failed after retry`,
            tool: toolName,
            rawResult,
            toolInput,
            status: 'failed',
            failReason: verifyReason,
            retried: true,
            microStep: stepFocus !== objective
          })
          stepId++
          continue
        }
      }

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
        status: 'ok',
        microStep: stepFocus !== objective,
        retried: retriedSteps.has(stepId)
      })

      if (stepId > 4 && stepId > skipNoProgressUntilStepId) {
        const lastFour = results.slice(-4).map(r => r.tool)
        const progressTools = [
          'memory_set', 'create_directory', 'move_file',
          'write_file', 'delete_file', 'run_command', 'web_search'
        ]
        const hasProgress = lastFour.some(t => progressTools.includes(t))
        if (!hasProgress) {
          const recovered = await tryReactiveDecompose('no progress in last 4 steps')
          if (recovered) {
            continue
          }
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

  private parseMicroSteps(response: string): string[] {
    const lines = response.split('\n')
    const steps: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^\d+[.)]\s*/.test(trimmed)) {
        const step = trimmed.replace(/^\d+[.)]\s*/, '')
        if (step.length > 0) {
          steps.push(step)
        }
      }
      if (steps.length >= 3) break
    }
    return steps
  }
}
