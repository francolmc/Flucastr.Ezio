import type { Fact, StepResult } from '../types/index'

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

export function buildExaminePrompt(
  understanding: string,
  stepResults: Array<{ summary: string; status: string }>,
  dateContext?: string
): string {
  let prompt = `Verify if the executed steps accomplish the objective.

${dateContext ? `${dateContext}\n` : ''}OBJECTIVE: ${understanding}

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
  gapContext?: string,
  workingStateData?: Record<string, unknown>,
  dateContext?: string
): string {
  let prompt = `Generate the final response to the user.

${dateContext ? `${dateContext}\n` : ''}OBJECTIVE: ${understanding}
`
  if (userProfile.length > 0) {
    prompt += `\nUSER CONTEXT:\n`
    for (const fact of userProfile) {
      prompt += `- ${fact.key}: ${fact.value}\n`
    }
  }

  const confirmedCalls = workingStateData?.confirmedCalls as Record<string, Array<{ inputHash: string; inputPreview: string; stepNumber: number }>> | undefined
  if (confirmedCalls && Object.keys(confirmedCalls).length > 0) {
    prompt += `\nCONFIRMED ACTIONS (previously executed successfully):\n`
    for (const [toolName, calls] of Object.entries(confirmedCalls)) {
      prompt += `- ${toolName} (×${calls.length}): ${calls.map(c => c.inputPreview).join(', ')}\n`
    }
    prompt += `\n`
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
- CRITICAL: Use the "Current date" provided above (if present) as the only source of truth for what "today", "tomorrow", or any relative date means. NEVER infer today's date from dates mentioned inside search results or step summaries — those are dates ABOUT the topic, not the current date.
- CRITICAL: Base your response ONLY on the step results provided below. If a step failed or has no result, say so honestly. NEVER invent, fabricate, or assume file contents, search results, or any information that does not appear in the step results. If all steps failed, tell the user what went wrong, do not make up an answer.
- Use ONLY information from the summaries above — never invent details
- If the objective was accomplished: confirm it and share key results
- If it failed or was partial: explain what was achieved and what was not
- Be direct and natural — do not explain internal processes
- Never fabricate results, files, or actions that did not occur`
  return prompt
}
