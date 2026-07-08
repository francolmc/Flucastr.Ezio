import type { Tool } from '../types/index'
import { createLogger } from '../utils/Logger'

const logger = createLogger('WorkingMemory')

export class WorkingMemory {
  private store: Map<string, string> = new Map()

  set(key: string, value: string | string[] | unknown): string {
    const strValue = Array.isArray(value)
      ? (value as string[]).join(', ')
      : String(value)
    this.store.set(key, strValue)
    logger.debug(`set: ${key} = ${strValue.slice(0, 100)}`)
    return `Saved to working memory: ${key}`
  }

  get(key: string): string {
    const value = this.store.get(key)
    if (!value) return `Key not found in working memory: ${key}`
    logger.debug(`get: ${key}`)
    return value
  }

  list(): string {
    if (this.store.size === 0) return 'Working memory is empty'
    return Array.from(this.store.entries())
      .map(([k, v]) => `${k}: ${v.slice(0, 200)}`)
      .join('\n')
  }

  clear(): void {
    this.store.clear()
    logger.debug('cleared')
  }

  toContext(): string | null {
    if (this.store.size === 0) return null
    return `WORKING MEMORY (data stored during this task):\n${this.list()}`
  }

  getTools(): Tool[] {
    return [
      {
        name: 'memory_set',
        description: 'Save data to working memory for use in later steps of this task',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Name for this data (e.g. "zip_files", "pending_moves")' },
            value: { type: 'string', description: 'Data to store' }
          },
          required: ['key', 'value']
        }
      },
      {
        name: 'memory_get',
        description: 'Retrieve data previously saved to working memory',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Name of the data to retrieve' }
          },
          required: ['key']
        }
      }
    ]
  }

  executeTool(name: string, input: Record<string, unknown>): string {
    if (name === 'memory_set') {
      return this.set(input.key as string, input.value as string | string[])
    }
    if (name === 'memory_get') {
      return this.get(input.key as string)
    }
    return `Unknown memory tool: ${name}`
  }

  isTool(name: string): boolean {
    return name === 'memory_set' || name === 'memory_get'
  }
}