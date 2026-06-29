import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { ReasoningEngine } from '../ReasoningEngine'
import { createReasoningConfig } from '../types'

describe('ReasoningEngine', () => {
  let mockAdapter: ModelAdapter
  let engine: ReasoningEngine

  beforeEach(() => {
    mockAdapter = { complete: vi.fn() }
    engine = new ReasoningEngine(mockAdapter, createReasoningConfig({ modelSize: 'medium' }))
  })

  describe('resolve()', () => {
    it('resolves simple problem without user interaction', async () => {
      mockAdapter.complete
        .mockResolvedValueOnce('Simple problem')
        .mockResolvedValueOnce('{"isComplex": false, "reason": "straightforward", "suggestedSteps": 1}')
        .mockResolvedValueOnce('Plan reasoning')
        .mockResolvedValueOnce('{"summary": "One step", "steps": [{"order": 1, "description": "Do it", "reasoning": ""}]}')
        .mockResolvedValueOnce('Step result')
        .mockResolvedValueOnce('Final answer')
        .mockResolvedValueOnce('Verification reasoning')
        .mockResolvedValueOnce('{"isVerified": true, "verificationReport": "OK", "issuesFound": []}')

      const callbacks = { onUserValidation: vi.fn() }
      const result = await engine.resolve('Simple task', callbacks)

      expect(result.wasComplex).toBe(false)
      expect(result.success).toBe(true)
      expect(callbacks.onUserValidation).not.toHaveBeenCalled()
    })

    it('resolves complex problem with user validation', async () => {
      mockAdapter.complete
        .mockResolvedValueOnce('Complex problem')
        .mockResolvedValueOnce('{"isComplex": true, "reason": "multiple steps", "suggestedSteps": 3}')
        .mockResolvedValueOnce('Plan reasoning')
        .mockResolvedValueOnce('{"summary": "Multi-step plan", "steps": [{"order": 1, "description": "Step 1", "reasoning": ""}]}')
        .mockResolvedValueOnce('Internal review')
        .mockResolvedValueOnce('{"needsIteration": true, "userMessage": "Please review"}')
        .mockResolvedValueOnce('User feedback reasoning')
        .mockResolvedValueOnce('{"summary": "Revised", "steps": [{"order": 1, "description": "Step 1 revised", "reasoning": ""}]}')
        .mockResolvedValueOnce('Presentation reasoning')
        .mockResolvedValueOnce('{"needsIteration": false, "userMessage": null}')
        .mockResolvedValueOnce('Step result')
        .mockResolvedValueOnce('Final answer')
        .mockResolvedValueOnce('Verification')
        .mockResolvedValueOnce('{"isVerified": true, "verificationReport": "OK", "issuesFound": []}')

      let validationCallCount = 0
      const callbacks = {
        onUserValidation: vi.fn().mockImplementation(() => {
          validationCallCount++
          if (validationCallCount === 1) {
            return Promise.resolve('Please improve step 1')
          }
          return Promise.resolve('ok')
        })
      }

      const result = await engine.resolve('Complex task', callbacks)

      expect(result.wasComplex).toBe(true)
      expect(result.validationIterations).toBe(2)
      expect(callbacks.onUserValidation).toHaveBeenCalled()
    })

    it('returns resolution result with all components', async () => {
      mockAdapter.complete
        .mockResolvedValueOnce('Analysis')
        .mockResolvedValueOnce('{"isComplex": false, "reason": "simple", "suggestedSteps": 1}')
        .mockResolvedValueOnce('Plan reasoning')
        .mockResolvedValueOnce('{"summary": "Simple", "steps": []}')
        .mockResolvedValueOnce('Step')
        .mockResolvedValueOnce('Final')
        .mockResolvedValueOnce('Verify')
        .mockResolvedValueOnce('{"isVerified": true, "verificationReport": "OK", "issuesFound": []}')

      const result = await engine.resolve('Task', { onUserValidation: vi.fn() })

      expect(result).toHaveProperty('complexity')
      expect(result).toHaveProperty('plan')
      expect(result).toHaveProperty('execution')
      expect(result).toHaveProperty('verification')
      expect(result).toHaveProperty('userMessages')
    })
  })

  describe('resolve() with small model (single-phase)', () => {
    beforeEach(() => {
      engine = new ReasoningEngine(mockAdapter, createReasoningConfig({ modelSize: 'small' }))
    })

    it('completes without user validation for simple problems', async () => {
      mockAdapter.complete
        .mockResolvedValueOnce('{"isComplex": false, "reason": "simple", "suggestedSteps": 1}')
        .mockResolvedValueOnce('{"summary": "Simple", "steps": [{"order": 1, "description": "Do it", "reasoning": ""}]}')
        .mockResolvedValueOnce('Step result')
        .mockResolvedValueOnce('Final answer')
        .mockResolvedValueOnce('{"isVerified": true, "verificationReport": "OK", "issuesFound": []}')

      const callbacks = { onUserValidation: vi.fn() }
      const result = await engine.resolve('Simple task', callbacks)

      expect(result.wasComplex).toBe(false)
      expect(callbacks.onUserValidation).not.toHaveBeenCalled()
    })
  })
})
