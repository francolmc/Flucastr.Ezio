import type { HarnessContext, Tool } from '../types/index'

export function buildReasonPrompt(context: HarnessContext): string {
  const hasPreviousResults = context.previousSummaries.length > 0

  let prompt = context.systemPromptBase + '\n\n'
  prompt += `You are executing step ${context.subtask.id} of a plan.\n`
  prompt += `YOUR ONLY JOB: execute this ONE step using the available tools.\n\n`

  if (hasPreviousResults) {
    prompt += `DATA ALREADY COLLECTED IN PREVIOUS STEPS:\n`
    prompt += `(This data is real and ready to use — do NOT search for it again)\n`
    prompt += context.previousSummaries.join('\n')
    prompt += '\n\n'
  }

  prompt += `CURRENT STEP TO EXECUTE: ${context.subtask.objective}\n\n`

  prompt += `AVAILABLE TOOLS:\n`
  for (const tool of context.tools) {
    const firstLine = tool.description.split('\n')[0]
    prompt += `- ${tool.name}: ${firstLine}\n`
  }

  prompt += `\n`

  if (hasPreviousResults) {
    prompt += `INSTRUCTIONS:\n`
    prompt += `- Use the data from PREVIOUS STEPS directly — it is already collected\n`
    prompt += `- Do NOT search for data that already exists in PREVIOUS STEPS\n`
    prompt += `- Your task is to execute the CURRENT STEP only\n`
    prompt += `- Reason about which tool to use and what exact parameters to provide\n`
  } else {
    prompt += `Reason about which tool to use and what exact parameters to provide.\n`
  }

  prompt += `Do not produce JSON here — just reason in natural language.`

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
