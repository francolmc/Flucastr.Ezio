import type { ModelAdapter, ChatMessage } from '@ezio/core'
import type { AnthropicToolSchema } from './types.js'

function buildToolsDescription(tools: AnthropicToolSchema[]): string {
  return tools.map(t => {
    const required = t.input_schema.required ?? []
    const props = Object.entries(t.input_schema.properties)
      .map(([k, v]) => `  - ${k} (${v.type})${required.includes(k) ? ' [REQUIRED]' : ''}: ${v.description ?? ''}`)
      .join('\n')
    return `${t.name}: ${t.description}\n${props}`
  }).join('\n\n')
}

export async function reasonPhase(
  adapter: ModelAdapter,
  system: string,
  messages: ChatMessage[],
  tools: AnthropicToolSchema[],
  numCtx?: number
): Promise<string> {
  const toolsDescription = buildToolsDescription(tools)
  const prompt = `${system.trim()}

Available tools:
${toolsDescription}

Previous conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

Based on the available tools and conversation, determine the next action. If a tool call is needed, name the tool and explain why. If the user's last message can be answered directly without any tool, do so.`

  return adapter.complete([
    { role: 'user', content: prompt }
  ], { temperature: 0, numCtx })
}

function parseJson(response: string): { tool: string; input: Record<string, unknown> } | null {
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
            // continue searching
          }
        }
        start = -1
      }
    }
  }
  return null
}

function suggestsToolCall(text: string, tools: AnthropicToolSchema[]): boolean {
  const lower = text.toLowerCase()
  if (tools.some(t => lower.includes(t.name.toLowerCase()))) return true
  const actionKeywords = ['llamar', 'call', 'tool', 'buscar', 'search', 'escribir', 'write', 'leer', 'read', 'enviar', 'send', 'crear', 'create', 'ejecutar', 'execute', 'obtener', 'get', 'consultar', 'query']
  return actionKeywords.some(k => lower.includes(k))
}

export async function serializePhase(
  adapter: ModelAdapter,
  reasonText: string,
  tools: AnthropicToolSchema[],
  numCtx?: number
): Promise<{ tool: string; input: Record<string, unknown> } | null> {
  if (!suggestsToolCall(reasonText, tools)) {
    return null
  }

  const toolsDescription = buildToolsDescription(tools)
  const prompt = `You have the following reasoning about what action to take:

${reasonText}

Available tools:
${toolsDescription}

Based on the reasoning above, produce a JSON object representing the tool call. If no tool call is actually needed, respond with just the text "NO_TOOL".

Format: { "tool": "toolName", "input": { ... } }
JSON response:`

  const response = await adapter.complete([
    { role: 'user', content: prompt }
  ], { temperature: 0, numCtx })

  if (response.trim() === 'NO_TOOL') {
    return null
  }

  return parseJson(response)
}
