import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { ProblemAnalyzer } from '../ProblemAnalyzer'
import { createReasoningConfig } from '../types'

describe('ProblemAnalyzer', () => {
  let mockAdapter: ModelAdapter
  let analyzer: ProblemAnalyzer

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    analyzer = new ProblemAnalyzer(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('analyze()', () => {
    it('returns complexity result from adapter response', async () => {
      mockAdapter.complete.mockResolvedValueOnce('This is a complex problem with multiple steps')
      mockAdapter.complete.mockResolvedValueOnce('{"isComplex": true, "reason": "multiple steps needed", "suggestedSteps": 4}')

      const result = await analyzer.analyze('Solve this complex problem')

      expect(result.isComplex).toBe(true)
      expect(result.reason).toBe('multiple steps needed')
      expect(result.suggestedSteps).toBe(4)
    })

    it('returns simple result when isComplex is false', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Simple straightforward question')
      mockAdapter.complete.mockResolvedValueOnce('{"isComplex": false, "reason": "straightforward", "suggestedSteps": 1}')

      const result = await analyzer.analyze('What is 2+2?')

      expect(result.isComplex).toBe(false)
      expect(result.reason).toBe('straightforward')
      expect(result.suggestedSteps).toBe(1)
    })

    it('caps suggestedSteps to maxPlanSteps', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Some problem')
      mockAdapter.complete.mockResolvedValueOnce('{"isComplex": true, "reason": "test", "suggestedSteps": 10}')

      const result = await analyzer.analyze('Test problem')

      expect(result.suggestedSteps).toBeLessThanOrEqual(5)
    })

    it('defaults suggestedSteps to 3 if not provided', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Some problem')
      mockAdapter.complete.mockResolvedValueOnce('{"isComplex": true, "reason": "test"}')

      const result = await analyzer.analyze('Test problem')

      expect(result.suggestedSteps).toBe(3)
    })

    it('uses default when JSON parsing fails', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Some reasoning')
      mockAdapter.complete.mockResolvedValueOnce('not valid json')

      const result = await analyzer.analyze('Test problem')

      expect(result.isComplex).toBe(false)
      expect(result.reason).toBe('Could not determine')
      expect(result.suggestedSteps).toBe(3)
    })

    it('extracts JSON even with surrounding text', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Some reasoning')
      mockAdapter.complete.mockResolvedValueOnce('Here is the result: {"isComplex": true, "reason": "test", "suggestedSteps": 2}')

      const result = await analyzer.analyze('Test problem')

      expect(result.isComplex).toBe(true)
    })
  })

  describe('twoPhaseReasoning: false (small model)', () => {
    beforeEach(() => {
      analyzer = new ProblemAnalyzer(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('only calls adapter once in single-phase mode', async () => {
      mockAdapter.complete.mockResolvedValueOnce('{"isComplex": false, "reason": "simple", "suggestedSteps": 1}')

      await analyzer.analyze('Simple question')

      expect(mockAdapter.complete).toHaveBeenCalledTimes(1)
    })
  })
})
