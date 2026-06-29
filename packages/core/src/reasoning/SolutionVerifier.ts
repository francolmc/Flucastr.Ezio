import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { ExecutionResult, VerificationResult, ReasoningConfig, ExecutionContext } from './types'

export class SolutionVerifier {
  constructor(
    private adapter: ModelAdapter,
    private config: ReasoningConfig
  ) {}

  async verify(execution: ExecutionResult, originalProblem: string, context: ExecutionContext = 'internal'): Promise<VerificationResult> {
    if (this.config.twoPhaseReasoning) {
      const reasoning = await this.reason(execution, originalProblem, context)
      return this.serialize(reasoning, execution, context)
    }
    return this.verifyDirect(execution, originalProblem, context)
  }

  private async reason(execution: ExecutionResult, originalProblem: string, context: ExecutionContext): Promise<string> {
    const failures = execution.failures.length > 0
      ? execution.failures.map(f => `Step ${f.stepId}: ${f.error}`).join(', ')
      : 'none'

    if (context === 'user-facing') {
      const prompt = `Verify that the solution is correct.

Original problem: ${originalProblem}
Steps executed: ${execution.steps.length}
Failures: ${failures}
Final output: ${execution.finalOutput.slice(0, 500)}

Check: Did all steps complete? Is the answer correct? Are there any issues?
Be thorough in your verification.`
      return this.adapter.complete([{ role: 'user', content: prompt }])
    }

    const prompt = `Verify solution for: ${originalProblem}
Steps: ${execution.steps.length}, Failures: ${failures}
Output: ${execution.finalOutput.slice(0, 500)}

Is solution correct?`

    return this.adapter.complete([{ role: 'user', content: prompt }])
  }

  private async serialize(reasoning: string, execution: ExecutionResult, context: ExecutionContext): Promise<VerificationResult> {
    if (context === 'user-facing') {
      const prompt = `Based on your verification:

${reasoning}

Output JSON: {"isVerified": boolean, "verificationReport": string, "issuesFound": string[]}

If the solution is correct, confirm it clearly. If there are issues, explain them.`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, execution)
    }

    const prompt = `Based on: ${reasoning}

Output JSON: {"isVerified": boolean, "verificationReport": string, "issuesFound": string[]}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, execution)
  }

  private async verifyDirect(execution: ExecutionResult, originalProblem: string, context: ExecutionContext): Promise<VerificationResult> {
    const failures = execution.failures.length > 0
      ? execution.failures.map(f => `Step ${f.stepId}: ${f.error}`).join(', ')
      : 'none'

    if (context === 'user-facing') {
      const prompt = `Verify the solution carefully. Output JSON directly.

Problem: ${originalProblem}
Steps: ${execution.steps.length}, Failures: ${failures}
Output: ${execution.finalOutput.slice(0, 500)}

Output ONLY JSON: {"isVerified": boolean, "verificationReport": string, "issuesFound": string[]}`
      const response = await this.adapter.complete([{ role: 'user', content: prompt }])
      return this.parseResponse(response, execution)
    }

    const prompt = `Verify solution. Output JSON directly.

Problem: ${originalProblem}
Steps: ${execution.steps.length}, Failures: ${failures}
Output: ${execution.finalOutput.slice(0, 500)}

Output ONLY JSON: {"isVerified": boolean, "verificationReport": string, "issuesFound": string[]}`

    const response = await this.adapter.complete([{ role: 'user', content: prompt }])
    return this.parseResponse(response, execution)
  }

  private parseResponse(response: string, execution: ExecutionResult): VerificationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          isVerified: Boolean(parsed.isVerified ?? !execution.failures.length),
          verificationReport: String(parsed.verificationReport || 'Done'),
          issuesFound: Array.isArray(parsed.issuesFound) ? parsed.issuesFound : []
        }
      }
    } catch {
      // fall through
    }

    return {
      isVerified: execution.success,
      verificationReport: 'Verified',
      issuesFound: execution.failures.length > 0
        ? execution.failures.map(f => `Step ${f.stepId} failed`)
        : []
    }
  }
}
