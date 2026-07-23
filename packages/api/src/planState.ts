import type { ChatMessage } from '@ezio/core'

export interface CompletedStep {
  tool: string
  input: Record<string, unknown>
  result: string | null
}

const TOOL_USE_RE = /\[tool_use:\s*(\S+)\s+(\{[\s\S]*?\})\]/g
const TOOL_RESULT_RE = /\[tool_result:\s*([\s\S]*?)\]/g

function tryParseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Reconstructs, in order, every tool call that has already been executed in
 * this conversation, together with its literal (unsummarized) result.
 *
 * Why this exists: reasonPhase used to re-derive "what step am I on" purely
 * from re-reading the raw conversation on every turn, with no explicit
 * tracking of progress. On multi-step plans (write -> read -> edit, or
 * search -> save) this caused the model to repeatedly re-propose the first
 * step instead of advancing, since nothing told it "this is done, move on".
 * By surfacing an explicit, structured list of completed steps + their
 * literal results, the model can just look up what's missing instead of
 * re-inferring it.
 */
export function extractCompletedSteps(messages: ChatMessage[]): CompletedStep[] {
  const steps: CompletedStep[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    TOOL_USE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TOOL_USE_RE.exec(msg.content)) !== null) {
      const tool = match[1]
      const input = tryParseJson(match[2])

      // The matching tool_result normally lands in the very next message.
      // Scan a small forward window in case of intermediate messages.
      let result: string | null = null
      for (let j = i; j < Math.min(i + 3, messages.length); j++) {
        TOOL_RESULT_RE.lastIndex = 0
        const resultMatch = TOOL_RESULT_RE.exec(messages[j].content)
        if (resultMatch) {
          result = resultMatch[1].trim()
          break
        }
      }

      steps.push({ tool, input, result })
    }
  }

  return steps
}

/**
 * Formats completed steps as an explicit block for the reasoning prompt.
 * Returns an empty string when there are no completed steps yet (first turn
 * of a plan), so callers can skip inserting an empty block.
 */
export function formatPlanState(steps: CompletedStep[]): string {
  if (steps.length === 0) return ''

  const lines = steps.map((s, idx) => {
    const inputStr = JSON.stringify(s.input)
    const resultStr = s.result !== null && s.result !== '' ? ` -> result: ${s.result}` : ' -> result: (unknown)'
    return `${idx + 1}. ${s.tool}(${inputStr})${resultStr}`
  })

  return `[PLAN_STATE]
The steps below have ALREADY been executed in this conversation, in order, with their literal (verbatim) results. Do NOT propose any of these calls again — repeating a completed step is a failure. Use the literal results shown here (not a paraphrase) if the next step needs them, e.g. for a calculation or to fill in content. Your job is to propose only the next step that has not been done yet, or to answer directly if every part of the request is already covered by the steps below.

${lines.join('\n')}
[/PLAN_STATE]`
}
