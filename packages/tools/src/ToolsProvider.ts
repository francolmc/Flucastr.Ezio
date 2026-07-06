import type { Tool } from '@ezio/core'
import { filesystemTools, filesystemExecutor } from './native/FilesystemTool'
import { shellTools, shellExecutor } from './native/ShellTool'
import { webSearchTools, webSearchExecutor } from './native/WebSearchTool'
import { McpRegistry, createMcpRegistry } from './mcp/McpRegistry'

export interface ToolsProviderConfig {
  mcpServers?: Array<{ name: string, url: string, enabled?: boolean }>
  disableNative?: {
    filesystem?: boolean
    shell?: boolean
    webSearch?: boolean
  }
}

class ToolsProvider {
  private mcpRegistry: McpRegistry
  private nativeExecutors: Record<string, (input: Record<string, unknown>) => Promise<string>>
  private nativeTools: Tool[]

  constructor(config: ToolsProviderConfig = {}) {
    this.mcpRegistry = createMcpRegistry(config.mcpServers ?? [])

    this.nativeTools = []
    this.nativeExecutors = {}

    if (!config.disableNative?.filesystem) {
      this.nativeTools.push(...filesystemTools)
      Object.assign(this.nativeExecutors, filesystemExecutor)
    }
    if (!config.disableNative?.shell) {
      this.nativeTools.push(...shellTools)
      Object.assign(this.nativeExecutors, shellExecutor)
    }
    if (!config.disableNative?.webSearch) {
      this.nativeTools.push(...webSearchTools)
      Object.assign(this.nativeExecutors, webSearchExecutor)
    }
  }

  async getTools(): Promise<Tool[]> {
    const mcpTools = await this.mcpRegistry.getTools()
    return [...this.nativeTools, ...mcpTools]
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (this.nativeExecutors[name]) {
      return this.nativeExecutors[name](input)
    }
    return this.mcpRegistry.callTool(name, input)
  }

  getToolExecutor(): (name: string, input: Record<string, unknown>) => Promise<string> {
    return this.callTool.bind(this)
  }
}

export { ToolsProvider }

export function createToolsProvider(config?: ToolsProviderConfig): ToolsProvider {
  return new ToolsProvider(config)
}