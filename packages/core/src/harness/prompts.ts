import type { HarnessContext, Tool } from '../types/index'

export function buildReasonPrompt(context: HarnessContext): string {
  let prompt = `${context.systemPromptBase}\n\n`
  prompt += `You are executing step ${context.subtask.id} of a multi-step plan.\n`

  if (context.previousSummaries.length > 0) {
    prompt += `\nINPUT FROM PREVIOUS STEPS:\n${context.previousSummaries.join('\n')}\n`
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
  let prompt = `Convert the following reasoning into a JSON tool invocation.\n\n`
  prompt += `REASONING:\n${reasoning}\n\n`
  prompt += `AVAILABLE TOOLS:\n`
  for (const tool of tools) {
    prompt += `- ${tool.name}:\n${JSON.stringify(tool.inputSchema, null, 2)}\n\n`
  }

  prompt += `CRITICAL: Copy values EXACTLY as they appear in the reasoning — do not truncate, abbreviate, or modify them.\n`
  prompt += `Output format: {"tool": "tool_name", "input": {...}}`
  return prompt
}

export function buildSummaryPrompt(
  subtaskId: number,
  tool: string,
  rawResult: string,
  toolInput: Record<string, unknown>
): string {
  let prompt = `Compress the following tool execution result into 3 lines or less.\n\n`
  prompt += `Step ${subtaskId} (${tool}) executed with input:\n${JSON.stringify(toolInput, null, 2)}\n\n`
  prompt += `Raw result:\n${rawResult}\n\n`
  prompt += `Provide a summary in this exact format:\n`
  prompt += `Step ${subtaskId} (${tool}): {one line description of what was done}\n`
  prompt += `Key output: {key value extracted, or 'none'}`
  return prompt
}

export function buildVerifyPrompt(objective: string, result: string): string {
  let prompt = `Determine if the following result accomplishes the stated objective.\n\n`
  prompt += `OBJECTIVE: ${objective}\n\n`
  prompt += `RESULT:\n${result}\n\n`
  prompt += `Respond with exactly YES or NO on the first line, followed by a sentence explaining why.`
  return prompt
}
