import type { AnthropicToolSchema } from './types.js'

export function findLastMentionIndex(text: string, name: string): number {
  const regex = new RegExp(`\\b${name}\\b`, 'gi')
  let lastIndex = -1
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    lastIndex = match.index
  }
  return lastIndex
}

export function detectMentionedTool(
  reasonText: string,
  tools: AnthropicToolSchema[]
): AnthropicToolSchema | null {
  let bestTool: AnthropicToolSchema | null = null
  let bestIndex = -1

  for (const tool of tools) {
    const idx = findLastMentionIndex(reasonText, tool.name)
    if (idx !== -1 && idx > bestIndex) {
      bestIndex = idx
      bestTool = tool
    }
  }

  return bestTool
}
