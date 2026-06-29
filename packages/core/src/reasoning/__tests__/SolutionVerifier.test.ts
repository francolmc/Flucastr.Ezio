import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { SolutionVerifier } from '../SolutionVerifier'
import { createReasoningConfig } from '../types'
import type { ExecutionResult } from '../types'

describe('SolutionVerifier', () => {
  let mockAdapter: ModelAdapter
  let verifier: SolutionVerifier

  const createExecutionResult = (): ExecutionResult => ({
    success: true,
    steps: [
      { id: 'step-1', order: 1, description: 'Step 1', reasoning: '', verified: true },
      { id: 'step-2', order: 2, description: 'Step 2', reasoning: '', verified: true }
    ],
    failures: [],
    finalOutput: 'The solution is complete'
  })

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    verifier = new SolutionVerifier(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('verify()', () => {
    it('returns verified result when solution is correct', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Verification reasoning')
      mockAdapter.complete.mockResolvedValueOnce('{"isVerified": true, "verificationReport": "All steps completed", "issuesFound": []}')

      const result = await verifier.verify(createExecutionResult(), 'Original problem')

      expect(result.isVerified).toBe(true)
      expect(result.verificationReport).toBe('All steps completed')
      expect(result.issuesFound).toEqual([])
    })

    it('returns issues when verification fails', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Has issues')
      mockAdapter.complete.mockResolvedValueOnce('{"isVerified": false, "verificationReport": "Problems found", "issuesFound": ["Step 1 incomplete"]}')

      const result = await verifier.verify(createExecutionResult(), 'Original problem')

      expect(result.isVerified).toBe(false)
      expect(result.issuesFound).toContain('Step 1 incomplete')
    })

    it('defaults to success true when JSON parsing fails', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Verification reasoning')
      mockAdapter.complete.mockResolvedValueOnce('not valid json')

      const result = await verifier.verify(createExecutionResult(), 'Problem')

      expect(result.isVerified).toBe(true)
    })

    it('defaults to failure when execution had failures', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Verification')
      mockAdapter.complete.mockResolvedValueOnce('not valid json')

      const execution: ExecutionResult = {
        success: false,
        steps: [],
        failures: [{ stepId: 'step-1', error: 'Failed' }],
        finalOutput: ''
      }

      const result = await verifier.verify(execution, 'Problem')

      expect(result.isVerified).toBe(false)
      expect(result.issuesFound).toContain('Step step-1 failed')
    })
  })

  describe('twoPhaseReasoning: false (small model)', () => {
    beforeEach(() => {
      verifier = new SolutionVerifier(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('only calls adapter once in single-phase mode', async () => {
      mockAdapter.complete.mockResolvedValueOnce('{"isVerified": true, "verificationReport": "OK", "issuesFound": []}')

      const result = await verifier.verify(createExecutionResult(), 'Problem')

      expect(mockAdapter.complete).toHaveBeenCalledTimes(1)
      expect(result.isVerified).toBe(true)
    })
  })
})
