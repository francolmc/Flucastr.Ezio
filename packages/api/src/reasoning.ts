import type { ModelAdapter, ChatMessage } from '@ezio/core'
import type { AnthropicToolSchema } from './types.js'
import { extractCompletedSteps, formatPlanState } from './planState.js'
import { createLogger } from '@ezio/core'
import { detectMentionedTool } from './toolMention.js'

const logger = createLogger('reasoning')

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
  requiresEnvironmentAction?: boolean,
  numGpu?: number
): Promise<string> {
  const toolsDescription = buildToolsDescription(tools)

  const planState = formatPlanState(extractCompletedSteps(messages))
  const planStateBlock = planState ? `${planState}\n\n` : ''

  const antiSelfConditioningNote = process.env.EZIO_DISABLE_ANTISC === 'true'
  ? ''
  : `

Important: if an earlier assistant turn in this conversation concluded that "no further action was needed" or that a task was "already resolved", that conclusion applied only to the user request at that point in time — it does NOT automatically apply to the newest user message below. Evaluate the newest user message on its own terms: if it asks for something new or additional (even a small change like adding to, modifying, or building on existing work), that is a new, separate request that needs its own action, regardless of what a previous turn concluded.`

  const actionInstruction = requiresEnvironmentAction === true
    ? `This task has already been determined to require a real action using one of the available tools above — you MUST propose a tool call, even if you already know the answer from your own training.

Example of the WRONG way to respond:
User asks: "who is the current president of Chile"
Wrong response: "The current president of Chile is Gabriel Boric." (this answers from memory, which may be outdated — WRONG)

Example of the CORRECT way to respond:
User asks: "who is the current president of Chile"
Correct response: "I will use the web_search tool to search for the current president of Chile, since this is time-sensitive information that may have changed since my training." (this proposes a tool call — CORRECT)

If [PLAN_STATE] is present above, check it first: if a step there already produced the information you need (e.g. a completed web_search with a literal result), use that literal result to finish the task now — do NOT call the same tool again to re-fetch information you already have. Only call a tool again if [PLAN_STATE] shows the specific action you now need is genuinely still missing.

Now, for the actual task above: you MUST explicitly write the exact tool name from the list above (e.g. "I will use the web_search tool to..."). Do not just output a raw answer or explanation without naming which tool executes it. Two more requirements for how you close your answer: (1) If completing this action requires writing or passing a literal value that depends on earlier results in this conversation (for example, the content of a file to create, or a specific computed value), you MUST state that literal value explicitly and completely in your answer now — do not just describe the intention to compute it later, since no one will compute it after you. (2) End your answer with a short final sentence naming only the single tool you have decided to use, as the very last words of your response — for example: '...using the write tool.' Do not name any other tool after that point.${antiSelfConditioningNote}`
    : `Based on the available tools and conversation, determine the next action. If [PLAN_STATE] is present above, it lists every tool call already executed, in order, with literal results — treat that list as ground truth about progress so far, and never propose a call that already appears there. If a tool call is needed for the step that is genuinely still missing, you MUST explicitly write the exact tool name from the list above (e.g. "I will use the bash tool to..."). Do not just output a raw shell command or code snippet without naming which tool executes it. If the user's request has multiple distinct parts, verify each part has already been resolved — per [PLAN_STATE] if present, otherwise from the conversation above — before answering directly; if any part is still unresolved and a tool above could resolve it, propose that tool call instead of answering. Only answer directly, without a tool, once every part of the user's request has been addressed, or if no available tool can help with what remains. Two more requirements for how you close your answer: (1) If completing this action requires writing or passing a literal value that depends on earlier results in this conversation (for example, the content of a file to create, or a specific computed value), you MUST state that literal value explicitly and completely in your answer now — do not just describe the intention to compute it later, since no one will compute it after you. (2) End your answer with a short final sentence naming only the single tool you have decided to use, as the very last words of your response — for example: '...using the write tool.' Do not name any other tool after that point.${antiSelfConditioningNote}`

  const prompt = `${system.trim()}

Available tools:
${toolsDescription}

${planStateBlock}Previous conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

${actionInstruction}`

  return adapter.complete([
    { role: 'user', content: prompt }
  ], { temperature: 0, numCtx, think: false, numGpu })
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
  numCtx?: number,
  numGpu?: number
): Promise<{ tool: string; input: Record<string, unknown> } | null> {
  const detectedTool = detectMentionedTool(reasonText, tools)
  const narrowedTools: AnthropicToolSchema[] = detectedTool ? [detectedTool] : tools

  if (detectedTool) {
    logger.info('serializePhase tool narrowing', { detected: detectedTool.name })
  }

  const toolsDescription = buildToolsDescription(narrowedTools)
  const prompt = `You have the following reasoning about what action to take:

${reasonText}

Available tools:
${toolsDescription}

Based on the reasoning above, produce a JSON object representing the tool call. If no tool call is actually needed, respond with just the text "NO_TOOL".

Format: { "tool": "toolName", "input": { ... } }
JSON response:`

  const toolNames = narrowedTools.map(t => t.name)
  const responseFormat = {
    type: 'object',
    properties: {
      tool: { type: 'string', enum: toolNames },
      input: { type: 'object' }
    },
    required: ['tool', 'input']
  }

  const response = await adapter.complete([
    { role: 'user', content: prompt }
  ], { temperature: 0, numCtx, think: false, numGpu, responseFormat })

  logger.info('serializePhase raw response completa', { response })

  logger.debug('serializePhase raw response', {
    reasonTextPreview: reasonText.slice(0, 300),
    serializeResponsePreview: response.slice(0, 300)
  })

  if (response.trim() === 'NO_TOOL') {
    logger.info('serializePhase devolvió NO_TOOL', { reasonTextPreview: reasonText.slice(0, 300) })
    return null
  }

  const parsed = parseJson(response)
  if (parsed === null) {
    logger.info('serializePhase parse failed', { rawResponse: response })
  }
  return parsed
}
