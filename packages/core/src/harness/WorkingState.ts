export interface WorkingStateData {
  objective: string
  trackedFiles: Record<string, string[]>
  createdDirectories: string[]
  movedFiles: string[]
  writtenFiles: string[]
  searchResults: string[]
  lastTool: string
  lastResult: string
  stepNumber: number
  toolCallCounts: Record<string, number>
}

export class WorkingState {
  private data: WorkingStateData

  constructor(objective: string) {
    this.data = {
      objective,
      trackedFiles: {},
      createdDirectories: [],
      movedFiles: [],
      writtenFiles: [],
      searchResults: [],
      lastTool: '',
      lastResult: '',
      stepNumber: 0,
      toolCallCounts: {}
    }
  }

  update(
    tool: string,
    toolInput: Record<string, unknown>,
    rawResult: string,
    stepNumber: number
  ): void {
    this.data.lastTool = tool
    this.data.lastResult = rawResult.slice(0, 500)
    this.data.stepNumber = stepNumber
    this.data.toolCallCounts[tool] = (this.data.toolCallCounts[tool] ?? 0) + 1

    switch (tool) {
      case 'list_directory': {
        const lines = rawResult.split('\n')
        const files = lines
          .filter(l => l.includes('[FILE]'))
          .map(l => {
            const withSize = l.match(/\[FILE\]\s+(.+?)\s+\(/)
            if (withSize) return withSize[1].trim()
            const withoutSize = l.match(/\[FILE\]\s+(.+)/)
            if (withoutSize) return withoutSize[1].trim()
            return null
          })
          .filter((f): f is string => f !== null)

        const path = (toolInput.path as string) ?? 'unknown'
        const filter = (toolInput.filter as string) ?? 'all'
        const key = `${path}:${filter}`
        this.data.trackedFiles[key] = files
        break
      }

      case 'create_directory': {
        const path = toolInput.path as string
        if (rawResult.includes('created') && path) {
          if (!this.data.createdDirectories.includes(path)) {
            this.data.createdDirectories.push(path)
          }
        }
        break
      }

      case 'move_file': {
        const source = toolInput.source as string
        if (rawResult.startsWith('Moved:') && source) {
          if (!this.data.movedFiles.includes(source)) {
            this.data.movedFiles.push(source)
          }
        }
        break
      }

      case 'write_file': {
        const path = toolInput.path as string
        if (rawResult.includes('written') && path) {
          if (!this.data.writtenFiles.includes(path)) {
            this.data.writtenFiles.push(path)
          }
        }
        break
      }

      case 'web_search': {
        const query = toolInput.query as string
        if (query) {
          this.data.searchResults.push(query)
        }
        break
      }
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

    const fileEntries = Object.entries(this.data.trackedFiles)
    if (fileEntries.length > 0) {
      lines.push('\nFiles found:')
      for (const [key, files] of fileEntries) {
        const label = key.split(':')[1] ?? key
        const preview = files.slice(0, 5).join(', ')
        const more = files.length > 5 ? ` ... and ${files.length - 5} more` : ''
        lines.push(`  [${label}]: ${files.length} files — ${preview}${more}`)
      }
    }

    if (this.data.createdDirectories.length > 0) {
      lines.push(`\nDirectories created: ${this.data.createdDirectories.join(', ')}`)
    }

    if (this.data.movedFiles.length > 0) {
      lines.push(`\nFiles moved: ${this.data.movedFiles.join(', ')}`)
    }

    if (this.data.writtenFiles.length > 0) {
      lines.push(`\nFiles written: ${this.data.writtenFiles.join(', ')}`)
    }

    if (this.data.searchResults.length > 0) {
      lines.push(`\nSearches done: ${this.data.searchResults.join(', ')}`)
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
    objective: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): 'confirmed' | 'unknown' {
    switch (toolName) {
      case 'move_file': {
        const source = toolInput.source as string
        if (source && this.data.movedFiles.includes(source)) {
          return 'confirmed'
        }
        break
      }
      case 'create_directory': {
        const path = toolInput.path as string
        if (path && this.data.createdDirectories.includes(path)) {
          return 'confirmed'
        }
        break
      }
      case 'write_file': {
        const path = toolInput.path as string
        if (path && this.data.writtenFiles.includes(path)) {
          return 'confirmed'
        }
        break
      }
      case 'list_directory':
      case 'search_files': {
        const path = (toolInput.path as string) ?? 'unknown'
        const filter = (toolInput.filter as string) ?? 'all'
        const key = `${path}:${filter}`
        if (this.data.trackedFiles[key] !== undefined) {
          return 'confirmed'
        }
        break
      }
    }
    return 'unknown'
  }
}