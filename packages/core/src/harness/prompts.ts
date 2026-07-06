import type { HarnessContext, Tool } from '../types/index'

export function buildReasonPrompt(context: HarnessContext): string {
  let prompt = `${context.systemPromptBase}\n\n`
  prompt += `You are executing step ${context.subtask.id} of a multi-step plan.\n`

  if (context.previousSummaries.length > 0) {
    prompt += `\nRESULTS FROM PREVIOUS STEPS (use this data directly):\n`
    prompt += context.previousSummaries.join('\n')
    prompt += `\n\nCRITICAL: The content above is real data already retrieved. `
    prompt += `Use it directly — do NOT search for it again or leave content empty.\n`
  }

  prompt += `\nYOUR CURRENT TASK: ${context.subtask.objective}\n`
  prompt += `\nAVAILABLE TOOLS:\n`
  for (const tool of context.tools) {
    const firstLine = tool.description.split('\n')[0]
    prompt += `- ${tool.name}: ${firstLine}\n`
  }

  prompt += `\nReason in natural language about which tool to use and what parameters to provide. Do not restrict yourself to JSON format.`
  return prompt
}

export function buildSerializePrompt(reasoning: string, tools: Tool[]): string {
  let prompt = `You must convert the following reasoning into a JSON tool call.

REASONING:
${reasoning}

AVAILABLE TOOLS AND REQUIRED FIELDS:
`
  for (const tool of tools) {
    const required = (tool.inputSchema as any)?.required ?? []
    const props = (tool.inputSchema as any)?.properties ?? {}
    const fields = required.map((r: string) =>
      `  "${r}": ${props[r]?.description ?? 'string'}`
    ).join(',\n')
    prompt += `${tool.name}:\n  required fields: {\n${fields}\n}\n\n`
  }

  prompt += `CRITICAL RULES:
- Respond with ONLY a JSON object — no explanation, no markdown, no backticks
- Use EXACTLY this format: {"tool": "tool_name", "input": {"param": "value"}}
- Copy parameter values EXACTLY as they appear in the reasoning
- Use ONLY tool names from the list above
- Do NOT add any text before or after the JSON

JSON response:`
  return prompt
}

export function buildSummaryPrompt(
  subtaskId: number,
  tool: string,
  rawResult: string,
  toolInput: Record<string, unknown>
): string {
  const truncated = rawResult.slice(0, 2000)
  const wasTruncated = rawResult.length > 2000

  return `Compress this tool execution into a summary for the next step.

Step ${subtaskId} executed tool: ${tool}
Input used: ${JSON.stringify(toolInput)}
Result:
${truncated}${wasTruncated ? '\n[truncated]' : ''}

Write the summary in this EXACT format:
Step ${subtaskId} (${tool}): {one line describing what was done}
Key output: {the most important value or content from the result, verbatim if short}

CRITICAL: If the result contains text content (search results, file contents, etc.),
include the first 500 characters verbatim in "Key output" so the next step can use it.`
}

export function buildVerifyPrompt(objective: string, result: string): string {
  let prompt = `Determine if the following result accomplishes the stated objective.\n\n`
  prompt += `OBJECTIVE: ${objective}\n\n`
  prompt += `RESULT:\n${result}\n\n`
  prompt += `Respond with exactly YES or NO on the first line, followed by a sentence explaining why.`
  return prompt
}
