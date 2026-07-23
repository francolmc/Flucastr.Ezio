import type { MessagesResponse } from '../src/pipeline.js'
import type { ScenarioL2 } from './scenarios.js'

export function gradeResponse(
  response: MessagesResponse,
  expected: ScenarioL2['expected']
): { pass: boolean; reason: string } {
  const content = response.content[0]

  if (expected.type === 'text') {
    if (content?.type === 'text') {
      return { pass: true, reason: 'ok' }
    }
    return { pass: false, reason: `expected text response, got ${content?.type ?? 'empty'}` }
  }

  if (content?.type !== 'tool_use') {
    return { pass: false, reason: `expected tool_use, got ${content?.type ?? 'empty'}` }
  }

  const toolName = (content as { name: string }).name

  if (!expected.acceptableTools || !expected.acceptableTools.includes(toolName)) {
    return {
      pass: false,
      reason: `tool '${toolName}' not in acceptable tools [${expected.acceptableTools?.join(', ')}]`
    }
  }

  if (expected.acceptableTools.length === 1) {
    const toolInput = (content as { input: Record<string, unknown> }).input

    if (expected.structuredFields) {
      for (const [key, value] of Object.entries(expected.structuredFields)) {
        const actual = toolInput[key]
        if (typeof actual !== 'string' && typeof value === 'string') {
          return { pass: false, reason: `field '${key}' should be string, got ${typeof actual}` }
        }
        const actualLower = String(actual).toLowerCase()
        const valueLower = String(value).toLowerCase()
        if (actualLower !== valueLower) {
          return { pass: false, reason: `field '${key}' expected '${value}', got '${actual}'` }
        }
      }
    }

    if (expected.freeTextFields) {
      for (const [key, regex] of Object.entries(expected.freeTextFields)) {
        const actual = toolInput[key]
        if (actual === undefined || actual === null) {
          return { pass: false, reason: `field '${key}' is missing` }
        }
        if (!regex.test(String(actual))) {
          return {
            pass: false,
            reason: `field '${key}' value '${actual}' does not match regex ${regex}`
          }
        }
      }
    }
  }

  return { pass: true, reason: 'ok' }
}
