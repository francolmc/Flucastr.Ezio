import { createHash } from 'node:crypto'
import type { WorkingStateData, ConfirmedCall, Tool } from '../types/index'

export { WorkingStateData, ConfirmedCall }

export class WorkingState {
  private data: WorkingStateData

  constructor(objective: string) {
    this.data = {
      objective,
      confirmedCalls: {},
      lastTool: '',
      lastResult: '',
      stepNumber: 0,
      toolCallCounts: {}
    }
  }

  private hashInput(input: Record<string, unknown>): string {
    const serialized = JSON.stringify(input)
    return createHash('sha256').update(serialized).digest('hex').slice(0, 12)
  }

  private inputPreview(input: Record<string, unknown>): string {
    const serialized = JSON.stringify(input)
    return serialized.length > 200 ? serialized.slice(0, 200) + '...' : serialized
  }

  private isError(rawResult: string): boolean {
    return rawResult.trimStart().toLowerCase().startsWith('error')
  }

  update(
    toolDef: Tool,
    toolInput: Record<string, unknown>,
    rawResult: string,
    stepNumber: number
  ): void {
    const toolName = toolDef.name
    this.data.lastTool = toolName
    this.data.lastResult = rawResult.slice(0, 500)
    this.data.stepNumber = stepNumber
    this.data.toolCallCounts[toolName] = (this.data.toolCallCounts[toolName] ?? 0) + 1

    if (this.isError(rawResult)) {
      return
    }

    const hash = this.hashInput(toolInput)

    if (!this.data.confirmedCalls[toolName]) {
      this.data.confirmedCalls[toolName] = []
    }

    const alreadyRecorded = this.data.confirmedCalls[toolName].some(
      entry => entry.inputHash === hash
    )

    if (!alreadyRecorded) {
      this.data.confirmedCalls[toolName].push({
        inputHash: hash,
        inputPreview: this.inputPreview(toolInput),
        stepNumber
      })
    }
  }

  toPromptBlock(): string {
    const lines: string[] = ['=== WORKING STATE (maintained by system) ===']

    lines.push(`Objective: ${this.data.objective}`)
    lines.push(`Step: ${this.data.stepNumber}`)

    const callEntries = Object.entries(this.data.toolCallCounts)
    lines.push('\nActions taken this run: ' + (
      callEntries.length > 0
        ? callEntries.map(([tool, count]) => `${tool} (×${count})`).join(', ')
        : 'none yet'
    ))
    lines.push('IMPORTANT: If the objective requires an action to be performed (moving, creating, writing, sending, or any other mutating operation) and the tool that performs it does not appear above with a count greater than 0, that action has NOT happened yet — the objective is NOT complete regardless of how many read-only or exploratory tool calls were made.')

    const confirmedEntries = Object.entries(this.data.confirmedCalls)
    if (confirmedEntries.length > 0) {
      lines.push('\nConfirmed actions:')
      for (const [toolName, entries] of confirmedEntries) {
        const count = entries.length
        const previews = entries.map(e => e.inputPreview).join(', ')
        lines.push(`  ${toolName} (×${count}): ${previews}`)
      }
    }

    lines.push(`\nLast action: ${this.data.lastTool}`)
    lines.push(`Last result: ${this.data.lastResult}`)
    lines.push('=== END WORKING STATE ===')

    return lines.join('\n')
  }

  getData(): WorkingStateData {
    return { ...this.data }
  }

  confirms(
    _objective: string,
    toolDef: Tool,
    toolInput: Record<string, unknown>
  ): 'confirmed' | 'unknown' {
    if (toolDef.annotations === undefined) {
      return 'unknown'
    }
    const hash = this.hashInput(toolInput)
    const entries = this.data.confirmedCalls[toolDef.name]
    if (entries && entries.some(e => e.inputHash === hash)) {
      return 'confirmed'
    }
    return 'unknown'
  }
}
