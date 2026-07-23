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
  numCtx?: number,
  requiresEnvironmentAction?: boolean
): Promise<string> {
  const toolsDescription = buildToolsDescription(tools)

  const actionInstruction = requiresEnvironmentAction === true
    ? `This task has already been determined to require a real action using one of the available tools above — you MUST propose a tool call, even if you already know the answer from your own training.

Example of the WRONG way to respond:
User asks: "who is the current president of Chile"
Wrong response: "The current president of Chile is Gabriel Boric." (this answers from memory, which may be outdated — WRONG)

Example of the CORRECT way to respond:
User asks: "who is the current president of Chile"
Correct response: "I will use the web_search tool to search for the current president of Chile, since this is time-sensitive information that may have changed since my training." (this proposes a tool call — CORRECT)

Now, for the actual task above: you MUST explicitly write the exact tool name from the list above (e.g. "I will use the web_search tool to..."). Do not just output a raw answer or explanation without naming which tool executes it.`
    : `Based on the available tools and conversation, determine the next action. If a tool call is needed, you MUST explicitly write the exact tool name from the list above (e.g. "I will use the bash tool to..."). Do not just output a raw shell command or code snippet without naming which tool executes it. If the user's request has multiple distinct parts, verify each part has already been resolved in the conversation above before answering directly — if any part is still unresolved and a tool above could resolve it, propose that tool call instead of answering. Only answer directly, without a tool, once every part of the user's request has been addressed, or if no available tool can help with what remains.`

  const prompt = `${system.trim()}

Available tools:
${toolsDescription}

Previous conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

${actionInstruction}`

  return adapter.complete([
    { role: 'user', content: prompt }
  ], { temperature: 0, numCtx, think: false })
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
  ], { temperature: 0, numCtx, think: false })

  if (response.trim() === 'NO_TOOL') {
    return null
  }

  return parseJson(response)
}
