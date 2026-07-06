import type { Fact, StepResult, Tool } from '../types/index'

export function buildUnderstandPrompt(
  message: string,
  userProfile: Fact[],
  sessionContext?: string,
  systemContext?: string
): string {
  let prompt = `Describe what the user wants based on their message.

USER MESSAGE: ${message}
`
  if (userProfile.length > 0) {
    prompt += `\nUSER CONTEXT:\n`
    for (const fact of userProfile) {
      prompt += `- ${fact.key}: ${fact.value}\n`
    }
  }
  if (sessionContext) {
    prompt += `\nCONVERSATION HISTORY (only to resolve ambiguous references):\n${sessionContext}\n`
  }
  if (systemContext) {
    prompt += `\nSYSTEM CONTEXT:\n${systemContext}\n`
  }
  prompt += `\nRespond in a single paragraph in third person, beginning with "The user wants to..." Identify: (1) the main action, (2) the central object or topic, (3) the expected outcome.`
  return prompt
}

export function buildPlanPrompt(
  understanding: string,
  tools: Tool[],
  sessionContext?: string,
  ritoGuia?: string,
  systemContext?: string
): string {
  let prompt = `Create a step-by-step plan to achieve the objective.

UNDERSTANDING: ${understanding}
`
  if (systemContext) {
    prompt += `\nSYSTEM PATHS (use these exact paths — never use relative paths like /Desktop):\n${systemContext}\n`
  }
  if (sessionContext) {
    prompt += `\nCONTEXT:\n${sessionContext}\n`
  }
  prompt += `\nAVAILABLE TOOLS:`
  for (const tool of tools) {
    prompt += `\n- ${tool.name}: ${tool.description}`
  }
  if (ritoGuia) {
    prompt += `\n\nLEARNING FROM SIMILAR PROBLEMS:\n${ritoGuia}\n(This is guidance only — do not copy it literally. Adapt the approach to the current objective.)`
  }
  prompt += `\n\nRules:
- Each step uses exactly ONE tool
- Steps must be in execution order  
- Include exact identifiers (paths, URLs, IDs) in each step
- Maximum 3 steps for most tasks — only exceed if strictly necessary
- If no tools are needed: respond with "NO_STEPS"
- Do NOT add verification, review, or duplicate steps

Format each step as: "N. Use [tool_name] to [action] [identifier]"

Example for "search X and create file Y":
1. Use web_search to search for X
2. Use write_file to create /absolute/path/Y.md with the search results

CRITICAL: Keep the plan minimal. 2 steps for search+write tasks.
Do NOT add extra steps to verify, review, or re-search.`
  return prompt
}

export function buildExaminePrompt(
  understanding: string,
  stepResults: Array<{ summary: string; status: string }>
): string {
  let prompt = `Verify if the executed steps accomplish the objective.

OBJECTIVE: ${understanding}

STEP RESULTS:`
  for (const result of stepResults) {
    const statusTag = result.status === 'ok' ? '[OK]' : '[FAILED]'
    prompt += `\n- ${statusTag} ${result.summary}`
  }
  prompt += `\n\nBe strict and honest. Respond with ONLY valid JSON:
{
  "accomplished": boolean,
  "summary": "what was achieved",
  "gaps": "what could not be completed (empty if accomplished)"
}`
  return prompt
}

export function buildRespondPrompt(
  message: string,
  understanding: string,
  stepResults: StepResult[],
  userProfile: Fact[],
  gapContext?: string
): string {
  let prompt = `Generate the final response to the user.

OBJECTIVE: ${understanding}
`
  if (userProfile.length > 0) {
    prompt += `\nUSER CONTEXT:\n`
    for (const fact of userProfile) {
      prompt += `- ${fact.key}: ${fact.value}\n`
    }
  }
  prompt += `\nSTEP RESULTS:`
  for (const result of stepResults) {
    const statusTag = result.status === 'ok' ? '[OK]' : '[FAILED]'
    prompt += `\n\n${statusTag} Step ${result.subtaskId} (${result.tool}):`
    if (result.summary) {
      prompt += `\nSummary: ${result.summary}`
    }
    if (result.rawResult && result.status === 'ok') {
      const truncated = result.rawResult.slice(0, 1500)
      prompt += `\nResult:\n${truncated}`
      if (result.rawResult.length > 1500) prompt += '\n[truncated]'
    }
    if (result.status === 'failed' && result.failReason) {
      prompt += `\nFailed: ${result.failReason}`
    }
  }
  if (gapContext) {
    prompt += `\n\nIMPORTANT: ${gapContext}`
  }
  prompt += `\n\nRules:
- CRITICAL: Base your response ONLY on the step results provided below. If a step failed or has no result, say so honestly. NEVER invent, fabricate, or assume file contents, search results, or any information that does not appear in the step results. If all steps failed, tell the user what went wrong, do not make up an answer.
- Use ONLY information from the summaries above — never invent details
- If the objective was accomplished: confirm it and share key results
- If it failed or was partial: explain what was achieved and what was not
- Be direct and natural — do not explain internal processes
- Never fabricate results, files, or actions that did not occur`
  return prompt
}
