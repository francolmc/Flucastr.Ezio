import type { Tool } from '@ezio/core'
import type { AnthropicToolSchema } from './types.js'

export function toInternalTool(schema: AnthropicToolSchema): Tool {
  return {
    name: schema.name,
    description: schema.description,
    inputSchema: schema.input_schema as Record<string, unknown>
  }
}

export function toInternalTools(schemas: AnthropicToolSchema[]): Tool[] {
  return schemas.map(toInternalTool)
}

export function backToExternalTools(
  selected: Tool[],
  originalSchemas: AnthropicToolSchema[]
): AnthropicToolSchema[] {
  const selectedNames = new Set(selected.map(t => t.name.toLowerCase()))
  return originalSchemas.filter(s => selectedNames.has(s.name.toLowerCase()))
}
