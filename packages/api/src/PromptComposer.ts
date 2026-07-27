import type { ContentSignals } from './contentModeDetector.js'

export interface DeterministicSignals extends ContentSignals {
  requiresEnvironmentAction: boolean
}

interface PromptSection {
  id: string
  priority: number
  condition: (signals: DeterministicSignals) => boolean
  template: string
}

const SECTIONS: PromptSection[] = [
  {
    id: 'anti-self-conditioning',
    priority: 5,
    condition: () => process.env.EZIO_DISABLE_ANTISC !== 'true',
    template: `

Important: if an earlier assistant turn in this conversation concluded that "no further action was needed" or that a task was "already resolved", that conclusion applied only to the user request at that point in time — it does NOT automatically apply to the newest user message below. Evaluate the newest user message on its own terms: if it asks for something new or additional (even a small change like adding to, modifying, or building on existing work), that is a new, separate request that needs its own action, regardless of what a previous turn concluded.`
  },
  {
    id: 'literal-identifier',
    priority: 10,
    condition: s => s.hasLiteralIdentifier && process.env.EZIO_DISABLE_LITERALFIDELITY !== 'true',
    template: `

Important: when the user's message specifies an exact name for a file, path, variable, or identifier (for example "combinado.py", "notas.txt", "config.json"), you MUST reproduce that exact string, character for character, in your answer and in any tool call you propose. Do NOT translate it into English or any other language, do NOT change its capitalization, and do NOT "improve" or normalize it, even if a translated or anglicized version seems more natural. Treat these names as opaque literals, not as words to interpret. This rule applies ONLY to names, paths, and identifiers — it does NOT apply to the content you write inside a file, which may need to be computed or combined from previous steps.`
  },
  {
    id: 'content-transform',
    priority: 20,
    condition: s => s.needsContentTransform && process.env.EZIO_DISABLE_CONTENTTRANSFORM !== 'true',
    template: `

Important: the content you are about to write is NOT simply a literal copy of the most recent piece of text mentioned in the conversation — it must be the RESULT of combining, concatenating, or computing from the relevant previous content (for example: adding a new line to what was already written, or computing a new numeric value from the previous one). Before writing, work out that combined or computed result explicitly, using the literal prior content shown in [PLAN_STATE] or in previous tool results above — do not just repeat the newest instruction's text on its own.`
  }
]

export class PromptComposer {
  compose(signals: DeterministicSignals): string {
    return SECTIONS
      .filter(s => s.condition(signals))
      .sort((a, b) => a.priority - b.priority)
      .map(s => s.template)
      .join('')
  }
}