import type { HarnessContext, Tool } from '../types/index'

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian'
}

export function buildDoneCheckPrompt(
  objective: string,
  previousStepResult: string | null,
  workingStateBlock: string
): string {
  return `You are a task completion evaluator.

OBJECTIVE: ${objective}

${workingStateBlock}

${previousStepResult
  ? `LAST ACTION RESULT:\n${previousStepResult}`
  : 'No actions taken yet.'}

IMPORTANT: The WORKING STATE above is maintained by the system and is always accurate. If WORKING STATE shows files found with a count, those files HAVE been listed successfully. Trust the count in WORKING STATE.

Has the OBJECTIVE been fully accomplished?
Answer ONLY "YES" or "NO" on the first line.
Then one sentence explaining why.

Rules:
- YES only if ALL parts of the objective are complete
- Use the WORKING STATE above to verify what has been done
- NO if anything is still pending`
}

export function buildStepReasonPrompt(
  objective: string,
  systemPromptBase: string,
  tools: Tool[],
  previousStepResult: string | null,
  workingStateBlock: string,
  memoryContext: string | null,
  systemContext?: string,
  rejectionContext?: string
): string {
  const toolList = tools
    .map(t => `- ${t.name}: ${t.description.split('\n')[0]}`)
    .join('\n')

  let prompt = `${systemPromptBase}\n\n`
  prompt += `OBJECTIVE: ${objective}\n\n`

  if (rejectionContext) {
    prompt += `PREVIOUS ATTEMPT WAS REJECTED: ${rejectionContext}\nTry a different approach.\n\n`
  }

  if (systemContext) {
    prompt += `SYSTEM CONTEXT:\n${systemContext}\n\n`
  }

  prompt += `${workingStateBlock}\n\n`

  if (memoryContext) {
    prompt += `${memoryContext}\n\n`
    prompt += `CRITICAL: Do NOT repeat actions for data `
    prompt += `already tracked in WORKING STATE above.\n\n`
  }

  if (previousStepResult) {
    prompt += `LAST ACTION RESULT:\n${previousStepResult}\n\n`
  }

  prompt += `AVAILABLE TOOLS:\n${toolList}\n\n`

  prompt += `IMPORTANT: If the next action requires substantial free-form content as a parameter (writing a report, essay, code, documentation, or any long text into a file), you MUST draft the COMPLETE content here, in full, right now — not a description of what it will contain. Write the actual finished text. The next phase will copy it verbatim into the tool call; it cannot invent content that isn't written here.\n\n`
  prompt += `TASK: What is the single next action to make progress?
  Use WORKING STATE to understand what has been done and what remains.
  Reason in natural language. Do NOT produce JSON here.`

  return prompt
}

export function buildFusedReasonPrompt(
  objective: string,
  stepFocus: string,
  systemPromptBase: string,
  tools: Tool[],
  previousStepResult: string | null,
  workingStateBlock: string,
  memoryContext: string | null,
  systemContext?: string,
  rejectionContext?: string
): string {
  const toolList = tools
    .map(t => `- ${t.name}: ${t.description.split('\n')[0]}`)
    .join('\n')

  let prompt = `${systemPromptBase}\n\n`
  prompt += `First, write a line starting with exactly 'STATUS: YES' if the following OVERALL OBJECTIVE is now fully accomplished per WORKING STATE, or 'STATUS: NO' otherwise:\n`
  prompt += `OVERALL OBJECTIVE: ${objective}\n\n`
  prompt += `Then, on the following lines, reason about the single next action to accomplish this specific FOCUS (or write 'Objective complete, no further action needed' if STATUS is YES):\n`
  prompt += `FOCUS: ${stepFocus}\n\n`

  if (rejectionContext) {
    prompt += `PREVIOUS ATTEMPT WAS REJECTED: ${rejectionContext}\nTry a different approach.\n\n`
  }

  if (systemContext) {
    prompt += `SYSTEM CONTEXT:\n${systemContext}\n\n`
  }

  prompt += `${workingStateBlock}\n\n`

  if (memoryContext) {
    prompt += `${memoryContext}\n\n`
    prompt += `CRITICAL: Do NOT repeat actions for data `
    prompt += `already tracked in WORKING STATE above.\n\n`
  }

  if (previousStepResult) {
    prompt += `LAST ACTION RESULT:\n${previousStepResult}\n\n`
  }

  prompt += `AVAILABLE TOOLS:\n${toolList}\n\n`

  prompt += `IMPORTANT: If the next action requires substantial free-form content as a parameter (writing a report, essay, code, documentation, or any long text into a file), you MUST draft the COMPLETE content here, in full, right now — not a description of what it will contain. Write the actual finished text. The next phase will copy it verbatim into the tool call; it cannot invent content that isn't written here.\n\n`
  prompt += `TASK: What is the single next action to make progress?
  Use WORKING STATE to understand what has been done and what remains.
  Reason in natural language. Do NOT produce JSON here.`

  return prompt
}

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
  let prompt = `Convert the reasoning into a JSON tool call.

REASONING:
${reasoning}

AVAILABLE TOOLS (use ONLY these exact parameter names):
`
  for (const tool of tools) {
    const props = (tool.inputSchema as any)?.properties ?? {}
    const required = ((tool.inputSchema as any)?.required as string[]) ?? []
    const optional = Object.keys(props).filter(k => !required.includes(k))

    prompt += `\n${tool.name}:\n`
    if (required.length > 0) {
      prompt += `  required: ${required.map(p => `"${p}": ${props[p]?.type ?? 'string'}`).join(', ')}\n`
    }
    if (optional.length > 0) {
      prompt += `  optional: ${optional.map(p => `"${p}": ${props[p]?.type ?? 'string'}`).join(', ')}\n`
    }
  }

  prompt += `
RULES:
- Respond with ONLY a JSON object — no markdown, no explanation
- Use EXACT parameter names shown above
- String values must be in double quotes
- Array values must use JSON format: ["item1", "item2"]
- Never use single quotes or unquoted values
- If the REASONING above contains drafted long-form content (an essay, report, code, or similar) intended for a parameter like "content", copy it into the JSON EXACTLY as written — verbatim, complete, character for character. Do NOT summarize, shorten, paraphrase, or replace it with a placeholder or description.

EXAMPLES of valid JSON:
  {"tool": "memory_set", "input": {"key": "my_files", "value": "file1.zip, file2.zip"}}
  {"tool": "list_directory", "input": {"path": "/Users/franco/Downloads", "filter": "*.zip"}}
  {"tool": "create_directory", "input": {"path": "/Users/franco/Downloads/Comprimidos"}}
  {"tool": "move_file", "input": {"source": "/path/file.zip", "destination": "/path/dir/"}}

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
  const isEmpty = rawResult.trim().length === 0
  const truncated = rawResult.slice(0, 1500)
  const keyOutputLimit = tool === 'list_directory' ? 3000 : 800
  const languageInstruction = targetLanguage && targetLanguage !== 'en'
    ? `\nWrite the Key output in ${LANGUAGE_NAMES[targetLanguage] ?? targetLanguage}.`
    : ''

  return `Summarize this tool execution for the next step.

TOOL USED: ${tool}
TOOL INPUT: ${JSON.stringify(toolInput)}
RAW RESULT:
${isEmpty ? '(empty — the tool returned no content)' : truncated}

Format:
Step ${subtaskId} (${tool}): {1-line description of what was done}
Key output: ${isEmpty ? 'none (result was empty)' : `{copy first ${keyOutputLimit} chars of RAW RESULT verbatim}`}${languageInstruction}

CRITICAL:
- If RAW RESULT is empty, Key output MUST be "none (result was empty)"
- NEVER invent or assume content that is not in RAW RESULT
- Copy RAW RESULT verbatim — do not paraphrase or add information`
}

export function buildVerifyPrompt(objective: string, result: string): string {
  let prompt = `Determine if the following result accomplishes the stated objective.\n\n`
  prompt += `OBJECTIVE: ${objective}\n\n`
  prompt += `RESULT:\n${result}\n\n`
  prompt += `Respond with exactly YES or NO on the first line, followed by a sentence explaining why.`
  prompt += `\nYou may reason first if needed, but your response MUST end with a final line that is exactly "ANSWER: YES" or "ANSWER: NO" — nothing after it.`
  return prompt
}

export function buildDecomposePrompt(
  stuckObjective: string,
  workingStateBlock: string,
  stuckReason: string
): string {
  return `The following sub-goal is stuck and has not progressed:
SUB-GOAL: ${stuckObjective}
REASON IT'S STUCK: ${stuckReason}
${workingStateBlock}

Break this SUB-GOAL down into 2 or 3 smaller, concrete next actions
that together would accomplish it. Each action must be achievable
with a single tool call. List them as a numbered list, one per line,
nothing else.`
}
