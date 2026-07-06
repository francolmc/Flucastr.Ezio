import type { Tool } from '@ezio/core'

export interface McpServerConfig {
  name: string
  url: string
  enabled?: boolean
}

export class McpRegistry {
  constructor(private servers: McpServerConfig[]) {}

  async getTools(): Promise<Tool[]> {
    return []
  }

  async callTool(name: string, _input: Record<string, unknown>): Promise<string> {
    throw new Error(`MCP tool '${name}' called but MCP connection is not yet implemented. Configure an MCP server to enable tool execution.`)
  }

  listServers(): Array<{ name: string, url: string, enabled: boolean }> {
    return this.servers.map(s => ({
      name: s.name,
      url: s.url,
      enabled: s.enabled ?? true
    }))
  }
}

export function createMcpRegistry(servers: McpServerConfig[]): McpRegistry {
  return new McpRegistry(servers)
}