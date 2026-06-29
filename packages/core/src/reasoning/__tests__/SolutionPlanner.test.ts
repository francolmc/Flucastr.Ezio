import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { SolutionPlanner } from '../SolutionPlanner'
import { createReasoningConfig } from '../types'
import type { ComplexityResult } from '../types'

describe('SolutionPlanner', () => {
  let mockAdapter: ModelAdapter
  let planner: SolutionPlanner

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    planner = new SolutionPlanner(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('createPlan()', () => {
    const complexity: ComplexityResult = { isComplex: false, reason: 'simple', suggestedSteps: 3 }

    it('creates plan with steps from adapter response', async () => {
      mockAdapter.complete.mockResolvedValueOnce('First do X, then Y, then Z')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Three step plan',
        steps: [
          { order: 1, description: 'Step 1', reasoning: 'First' },
          { order: 2, description: 'Step 2', reasoning: 'Second' },
          { order: 3, description: 'Step 3', reasoning: 'Third' }
        ]
      }))

      const result = await planner.createPlan('Do something', complexity)

      expect(result.summary).toBe('Three step plan')
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].description).toBe('Step 1')
      expect(result.steps[1].description).toBe('Step 2')
      expect(result.steps[2].description).toBe('Step 3')
    })

    it('generates unique IDs for each plan', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Step 1')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({ summary: 'Plan', steps: [] }))

      const plan1 = await planner.createPlan('Test', complexity)
      const plan2 = await planner.createPlan('Test', complexity)

      expect(plan1.id).not.toBe(plan2.id)
    })

    it('limits steps to maxPlanSteps', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Many steps')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Many steps',
        steps: [
          { order: 1, description: 'Step 1', reasoning: '' },
          { order: 2, description: 'Step 2', reasoning: '' },
          { order: 3, description: 'Step 3', reasoning: '' },
          { order: 4, description: 'Step 4', reasoning: '' },
          { order: 5, description: 'Step 5', reasoning: '' },
          { order: 6, description: 'Step 6', reasoning: '' }
        ]
      }))

      const result = await planner.createPlan('Test', complexity)

      expect(result.steps.length).toBeLessThanOrEqual(5)
    })

    it('creates default plan when JSON parsing fails', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Some reasoning')
      mockAdapter.complete.mockResolvedValueOnce('not valid json')

      const result = await planner.createPlan('Test', complexity)

      expect(result.steps).toHaveLength(3)
      expect(result.summary).toBe('3 steps')
    })

    it('sorts steps by order', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Steps')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Plan',
        steps: [
          { order: 3, description: 'Third', reasoning: '' },
          { order: 1, description: 'First', reasoning: '' },
          { order: 2, description: 'Second', reasoning: '' }
        ]
      }))

      const result = await planner.createPlan('Test', complexity)

      expect(result.steps[0].description).toBe('First')
      expect(result.steps[1].description).toBe('Second')
      expect(result.steps[2].description).toBe('Third')
    })

    it('sets verified to false for all steps', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Steps')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Plan',
        steps: [{ order: 1, description: 'Step 1', reasoning: '' }]
      }))

      const result = await planner.createPlan('Test', complexity)

      expect(result.steps[0].verified).toBe(false)
    })
  })

  describe('twoPhaseReasoning: false (small model)', () => {
    beforeEach(() => {
      planner = new SolutionPlanner(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('only calls adapter once in single-phase mode', async () => {
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Plan',
        steps: [{ order: 1, description: 'Step 1', reasoning: '' }]
      }))

      await planner.createPlan('Test', { isComplex: false, reason: 'simple', suggestedSteps: 1 })

      expect(mockAdapter.complete).toHaveBeenCalledTimes(1)
    })
  })
})
