import type { ModelAdapter } from '@ezio/core'
import { createLogger } from '@ezio/core'

const logger = createLogger('FallbackMessages')

export async function generateNoActionNeededMessage(
  adapter: ModelAdapter,
  effectiveSystem: string,
  numCtx?: number
): Promise<string> {
  const prompt = `${effectiveSystem.trim()}

Context: the user's task has already been completed by previous steps in this conversation — no further action is needed right now. Reply to the user directly, briefly confirming this, in your own configured voice, tone, and language as instructed above. Do not repeat this internal note back to the user, do not mention "steps" or "verification" mechanically — just give a natural, brief confirmation.`

  try {
    const response = await adapter.complete(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 200, numCtx, think: false }
    )
    return response.trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('generateNoActionNeededMessage fallback (last-resort circuit breaker)', { error: msg })
    return 'Task already completed, no further action needed.'
  }
}

export async function generateCouldNotCompleteMessage(
  adapter: ModelAdapter,
  effectiveSystem: string,
  reason: string,
  suggestion: string | undefined,
  numCtx?: number
): Promise<string> {
  const suggestionLine = suggestion ? `A possible next step: ${suggestion}` : ''
  const prompt = `${effectiveSystem.trim()}

Context: you were unable to determine a valid action to complete the user's task. Internal reason (for your context only, rephrase naturally, do not quote it verbatim): ${reason}
${suggestionLine}

Reply to the user directly, briefly explaining that you could not complete the task right now, and naturally mention the next step above if one was given. Use your own configured voice, tone, and language as instructed above.`

  try {
    const response = await adapter.complete(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 200, numCtx, think: false }
    )
    return response.trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('generateCouldNotCompleteMessage fallback (last-resort circuit breaker)', { error: msg })
    return 'Could not complete the requested action.'
  }
}
