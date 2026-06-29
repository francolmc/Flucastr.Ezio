import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { SolutionExecutor } from '../SolutionExecutor'
import { createReasoningConfig } from '../types'
import type { Plan } from '../types'

describe('SolutionExecutor', () => {
  let mockAdapter: ModelAdapter
  let executor: SolutionExecutor

  const createTestPlan = (): Plan => ({
    id: 'test-plan',
    summary: 'Test plan',
    steps: [
      { id: 'step-1', order: 1, description: 'Do X', reasoning: 'First action', verified: false },
      { id: 'step-2', order: 2, description: 'Do Y', reasoning: 'Second action', verified: false }
    ],
    createdAt: new Date()
  })

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    executor = new SolutionExecutor(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('execute()', () => {
    it('executes all steps and returns results', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Step 1 result')
      mockAdapter.complete.mockResolvedValueOnce('Step 2 result')
      mockAdapter.complete.mockResolvedValueOnce('Final answer')

      const result = await executor.execute(createTestPlan(), 'Original problem')

      expect(result.success).toBe(true)
      expect(result.steps).toHaveLength(2)
      expect(result.steps[0].verified).toBe(true)
      expect(result.steps[1].verified).toBe(true)
      expect(result.finalOutput).toBe('Final answer')
    })

    it('marks steps as verified when they produce output', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Result of step')
      mockAdapter.complete.mockResolvedValueOnce('Another result')
      mockAdapter.complete.mockResolvedValueOnce('Final')

      const result = await executor.execute(createTestPlan(), 'Problem')

      expect(result.steps[0].verified).toBe(true)
      expect(result.steps[1].verified).toBe(true)
    })

    it('limits execution to maxPlanSteps', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Step 1')
      mockAdapter.complete.mockResolvedValueOnce('Final')

      const plan: Plan = {
        id: 'test',
        summary: 'Many steps',
        steps: [
          { id: 's1', order: 1, description: 'Step 1', reasoning: '', verified: false },
          { id: 's2', order: 2, description: 'Step 2', reasoning: '', verified: false },
          { id: 's3', order: 3, description: 'Step 3', reasoning: '', verified: false },
          { id: 's4', order: 4, description: 'Step 4', reasoning: '', verified: false },
          { id: 's5', order: 5, description: 'Step 5', reasoning: '', verified: false },
          { id: 's6', order: 6, description: 'Step 6', reasoning: '', verified: false }
        ],
        createdAt: new Date()
      }

      const result = await executor.execute(plan, 'Problem')

      expect(result.steps.length).toBeLessThanOrEqual(5)
    })

    it('marks step as not verified when empty response', async () => {
      mockAdapter.complete.mockResolvedValueOnce('')
      mockAdapter.complete.mockResolvedValueOnce('')
      mockAdapter.complete.mockResolvedValueOnce('Final')

      const result = await executor.execute(createTestPlan(), 'Problem')

      expect(result.failures.length).toBe(0)
      expect(result.steps[0].verified).toBe(false)
      expect(result.steps[1].verified).toBe(false)
    })

    it('handles adapter errors gracefully', async () => {
      mockAdapter.complete.mockRejectedValueOnce(new Error('API error'))
      mockAdapter.complete.mockResolvedValueOnce('Step 2 result')
      mockAdapter.complete.mockResolvedValueOnce('Final')

      const result = await executor.execute(createTestPlan(), 'Problem')

      expect(result.failures.length).toBe(1)
      expect(result.failures[0].error).toBe('API error')
      expect(result.success).toBe(false)
    })
  })

  describe('user-facing context', () => {
    beforeEach(() => {
      executor = new SolutionExecutor(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('produces different prompts for user-facing context', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Step result')
      mockAdapter.complete.mockResolvedValueOnce('Final')

      await executor.execute(createTestPlan(), 'Problem', 'user-facing')

      expect(mockAdapter.complete).toHaveBeenCalled()
      const lastCall = mockAdapter.complete.mock.calls[0][0] as { role: string; content: string }[]
      expect(lastCall[0].content).toContain('thoroughly')
    })
  })
})
