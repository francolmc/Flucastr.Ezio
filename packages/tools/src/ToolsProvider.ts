import type { ModelAdapter, Tool } from '@ezio/core'
import { filesystemTools, filesystemExecutor } from './native/FilesystemTool'
import { shellTools, shellExecutor } from './native/ShellTool'
import { createWebSearchTool } from './native/WebSearchTool'
import { McpRegistry, createMcpRegistry } from './mcp/McpRegistry'
import { PostProcessor } from './PostProcessor'

export interface ToolsProviderConfig {
  mcpServers?: Array<{ name: string, url: string, enabled?: boolean }>
  tavilyApiKey?: string
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
      const { tools: wsTools, executor: wsExecutor } = createWebSearchTool({ tavilyApiKey: config.tavilyApiKey })
      this.nativeTools.push(...wsTools)
      Object.assign(this.nativeExecutors, wsExecutor)
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

  createToolExecutor(
    adapter?: ModelAdapter,
    targetLanguage?: string
  ): (name: string, input: Record<string, unknown>) => Promise<string> {
    const baseExecutor = this.getToolExecutor()

    if (!adapter || !targetLanguage || targetLanguage === 'en') {
      return baseExecutor
    }

    const postProcessor = new PostProcessor(adapter)

    return async (name: string, input: Record<string, unknown>) => {
      const result = await baseExecutor(name, input)

      if (
        name === 'write_file' &&
        result.startsWith('File written:') &&
        typeof input.path === 'string'
      ) {
        await postProcessor.translateFile(input.path, targetLanguage)
      }

      return result
    }
  }
}

export { ToolsProvider }

export function createToolsProvider(config?: ToolsProviderConfig): ToolsProvider {
  return new ToolsProvider(config)
}