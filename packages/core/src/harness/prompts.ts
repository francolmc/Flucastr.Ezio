import type { HarnessContext, Tool } from '../types/index'

export function buildReasonPrompt(context: HarnessContext): string {
  let prompt = context.systemPromptBase + '\n\n'
  prompt += `You are executing step ${context.subtask.id} of a plan.\n`
  prompt += `YOUR ONLY JOB: execute this ONE step using the available tools.\n\n`

  prompt += `CURRENT STEP TO EXECUTE: ${context.subtask.objective}\n\n`

  prompt += `AVAILABLE TOOLS:\n`
  for (const tool of context.tools) {
    const firstLine = tool.description.split('\n')[0]
    prompt += `- ${tool.name}: ${firstLine}\n`
  }

  prompt += `\n`
  prompt += `Reason about which tool to use and what exact parameters to provide.\n`
  prompt += `If DATA FROM PREVIOUS STEPS is provided in the user message, use that data directly.\n`
  prompt += `Do not produce JSON here — just reason in natural language.`

  return prompt
}

export function buildSerializePrompt(reasoning: string, tools: Tool[]): string {
  let prompt = `Convert the reasoning below into a JSON tool call.

REASONING:
${reasoning}

TOOL SCHEMAS (use ONLY these exact parameter names):
`
  for (const tool of tools) {
    const props = (tool.inputSchema as Record<string, unknown>)?.properties as Record<string, Record<string, string>> ?? {}
    const required = ((tool.inputSchema as Record<string, unknown>)?.required as string[]) ?? []
    const paramList = required.map(p => `"${p}": ${props[p]?.type ?? 'string'}`).join(', ')
    prompt += `- ${tool.name}({ ${paramList} })\n`
  }

  prompt += `
RULES:
- Respond with ONLY a JSON object — no markdown, no explanation
- Use the EXACT parameter names shown above — never invent new ones
- For content parameters: copy the actual content from the reasoning — never use placeholder strings like "search_results" or "content_here"
- If the reasoning mentions specific text, data, or results — that text IS the content value

Format: {"tool": "tool_name", "input": {"param": "value"}}`

  return prompt
}

export function buildSummaryPrompt(
  subtaskId: number,
  tool: string,
  rawResult: string,
  toolInput: Record<string, unknown>,
  targetLanguage?: string
): string {
  const truncated = rawResult.slice(0, 1500)
  const languageInstruction = targetLanguage && targetLanguage !== 'en'
    ? `\nWrite the Key output in ${targetLanguage}.`
    : ''

  return `Given the result of a subtask, produce a brief summary.

TOOL USED: ${tool}
TOOL INPUT: ${JSON.stringify(toolInput)}
RAW RESULT:
${truncated}

Format:
Step ${subtaskId} (${tool}): {1-line description in English of what was done}
Key output: {copy and translate the first 800 characters of RAW RESULT}${languageInstruction}

CRITICAL: Key output MUST contain the actual content from RAW RESULT.
Never write "none" if there is content in RAW RESULT.`
}

export function buildVerifyPrompt(objective: string, result: string): string {
  let prompt = `Determine if the following result accomplishes the stated objective.\n\n`
  prompt += `OBJECTIVE: ${objective}\n\n`
  prompt += `RESULT:\n${result}\n\n`
  prompt += `Respond with exactly YES or NO on the first line, followed by a sentence explaining why.`
  return prompt
}
