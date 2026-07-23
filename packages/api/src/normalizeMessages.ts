import type { ChatMessage } from '@ezio/core'

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string
}

export interface RawIncomingMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | AnthropicContentBlock[]
}

export function normalizeContent(content: string | AnthropicContentBlock[] | undefined | null): string {
  if (content === undefined || content === null) {
    return ''
  }

  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  if (content.length === 0) {
    return ''
  }

  const textParts: string[] = []

  for (const block of content) {
    if (block.type === 'text' && block.text !== undefined) {
      textParts.push(block.text)
    } else if (block.type === 'tool_use' && block.name !== undefined) {
      const inputStr = block.input !== undefined ? JSON.stringify(block.input) : '{}'
      textParts.push(`[tool_use: ${block.name} ${inputStr}]`)
    } else if (block.type === 'tool_result' && block.content !== undefined) {
      textParts.push(`[tool_result: ${block.content}]`)
    }
  }

  return textParts.join('\n')
}

export function normalizeMessages(messages: RawIncomingMessage[]): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map(msg => ({
    role: msg.role,
    content: normalizeContent(msg.content)
  }))
}

export function normalizeSystem(system: string | AnthropicContentBlock[] | undefined): string | undefined {
  if (system === undefined) return undefined
  const normalized = normalizeContent(system)
  return normalized === '' ? undefined : normalized
}

export function isGenuineUserText(msg: RawIncomingMessage): boolean {
  if (msg.role !== 'user') return false
  if (typeof msg.content === 'string') return true
  if (!Array.isArray(msg.content)) return false
  return msg.content.some(b => b.type === 'text' && b.text !== undefined && b.text.trim() !== '')
}

export function getLastGenuineUserText(messages: RawIncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isGenuineUserText(messages[i])) {
      return normalizeContent(messages[i].content)
    }
  }
  return ''
}
