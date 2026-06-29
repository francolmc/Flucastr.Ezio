import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { PlanValidator } from '../PlanValidator'
import { createReasoningConfig } from '../types'
import type { Plan } from '../types'

describe('PlanValidator', () => {
  let mockAdapter: ModelAdapter
  let validator: PlanValidator

  const createTestPlan = (): Plan => ({
    id: 'test-plan',
    summary: 'Test plan',
    steps: [
      { id: 'step-1', order: 1, description: 'Step 1', reasoning: 'First step', verified: false },
      { id: 'step-2', order: 2, description: 'Step 2', reasoning: 'Second step', verified: false }
    ],
    createdAt: new Date()
  })

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    validator = new PlanValidator(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('validatePlan()', () => {
    it('returns approved when adapter indicates approval', async () => {
      mockAdapter.complete.mockResolvedValueOnce('The plan looks good')
      mockAdapter.complete.mockResolvedValueOnce('{"isApproved": true, "needsIteration": false, "userMessage": null}')

      const result = await validator.validatePlan(createTestPlan())

      expect(result.isApproved).toBe(true)
      expect(result.needsIteration).toBe(false)
    })

    it('returns needsIteration when plan is not approved', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Has some concerns')
      mockAdapter.complete.mockResolvedValueOnce('{"isApproved": false, "needsIteration": true, "userMessage": "Please clarify"}')

      const result = await validator.validatePlan(createTestPlan())

      expect(result.isApproved).toBe(false)
      expect(result.needsIteration).toBe(true)
      expect(result.userMessage).toBe('Please clarify')
    })
  })

  describe('continueValidation()', () => {
    it('returns approved when user says ok', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'ok')

      expect(result.isApproved).toBe(true)
      expect(result.needsIteration).toBe(false)
      expect(mockAdapter.complete).not.toHaveBeenCalled()
    })

    it('returns approved when user says yes', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'yes')

      expect(result.isApproved).toBe(true)
    })

    it('returns approved when user says proceed', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'proceed')

      expect(result.isApproved).toBe(true)
    })

    it('returns approved when user says approved', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'approved')

      expect(result.isApproved).toBe(true)
    })

    it('returns approved when user says go ahead', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'go ahead')

      expect(result.isApproved).toBe(true)
    })

    it('returns approved when user says si', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'si')

      expect(result.isApproved).toBe(true)
    })

    it('returns approved when user says de acuerdo', async () => {
      const result = await validator.continueValidation(createTestPlan(), 'de acuerdo')

      expect(result.isApproved).toBe(true)
    })

    it('processes feedback when user rejects', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Understanding user feedback')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Revised plan',
        steps: [
          { order: 1, description: 'New Step 1', reasoning: '' }
        ]
      }))
      mockAdapter.complete.mockResolvedValueOnce('Presenting revised plan')
      mockAdapter.complete.mockResolvedValueOnce('{"needsIteration": true, "userMessage": "Revised plan ready"}')

      const result = await validator.continueValidation(createTestPlan(), 'No, change it')

      expect(result.isApproved).toBe(false)
      expect(result.plan.steps[0].description).toBe('New Step 1')
    })

    it('handles negative feedback with "no" prefix', async () => {
      mockAdapter.complete.mockResolvedValueOnce('Processing')
      mockAdapter.complete.mockResolvedValueOnce(JSON.stringify({
        summary: 'Revised',
        steps: [{ order: 1, description: 'Step 1', reasoning: '' }]
      }))
      mockAdapter.complete.mockResolvedValueOnce('Asking')
      mockAdapter.complete.mockResolvedValueOnce('{"needsIteration": true, "message": "Revised"}')

      const result = await validator.continueValidation(createTestPlan(), 'no me gusta')

      expect(result.isApproved).toBe(false)
    })
  })

  describe('twoPhaseReasoning: false (small model)', () => {
    beforeEach(() => {
      validator = new PlanValidator(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('only calls adapter once in single-phase mode', async () => {
      mockAdapter.complete.mockResolvedValueOnce('{"isApproved": true, "needsIteration": false, "userMessage": null}')

      const result = await validator.validatePlan(createTestPlan())

      expect(mockAdapter.complete).toHaveBeenCalledTimes(1)
      expect(result.isApproved).toBe(true)
    })
  })
})
