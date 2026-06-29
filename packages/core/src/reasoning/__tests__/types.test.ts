import { describe, it, expect } from 'vitest'
import { createReasoningConfig, DEFAULT_REASONING_CONFIG } from '../types'

describe('ReasoningConfig', () => {
  describe('createReasoningConfig', () => {
    it('returns default config for medium modelSize', () => {
      const config = createReasoningConfig({ modelSize: 'medium' })
      expect(config.modelSize).toBe('medium')
      expect(config.maxPlanSteps).toBe(5)
      expect(config.maxValidationIterations).toBe(3)
      expect(config.twoPhaseReasoning).toBe(true)
    })

    it('returns default config for large modelSize', () => {
      const config = createReasoningConfig({ modelSize: 'large' })
      expect(config.modelSize).toBe('large')
      expect(config.maxPlanSteps).toBe(5)
      expect(config.maxValidationIterations).toBe(3)
      expect(config.twoPhaseReasoning).toBe(true)
    })

    it('applies small modelSize overrides', () => {
      const config = createReasoningConfig({ modelSize: 'small' })
      expect(config.modelSize).toBe('small')
      expect(config.maxPlanSteps).toBe(4)
      expect(config.maxValidationIterations).toBe(3)
      expect(config.twoPhaseReasoning).toBe(false)
    })

    it('allows overriding maxPlanSteps', () => {
      const config = createReasoningConfig({ modelSize: 'medium', maxPlanSteps: 7 })
      expect(config.maxPlanSteps).toBe(7)
    })

    it('allows overriding maxValidationIterations', () => {
      const config = createReasoningConfig({ modelSize: 'medium', maxValidationIterations: 5 })
      expect(config.maxValidationIterations).toBe(5)
    })

    it('allows overriding twoPhaseReasoning', () => {
      const config = createReasoningConfig({ modelSize: 'medium', twoPhaseReasoning: false })
      expect(config.twoPhaseReasoning).toBe(false)
    })

    it('small modelSize override can be further overridden', () => {
      const config = createReasoningConfig({ modelSize: 'small', maxPlanSteps: 6 })
      expect(config.maxPlanSteps).toBe(6)
      expect(config.twoPhaseReasoning).toBe(false)
    })
  })

  describe('DEFAULT_REASONING_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_REASONING_CONFIG.modelSize).toBe('medium')
      expect(DEFAULT_REASONING_CONFIG.maxPlanSteps).toBe(5)
      expect(DEFAULT_REASONING_CONFIG.maxValidationIterations).toBe(3)
      expect(DEFAULT_REASONING_CONFIG.twoPhaseReasoning).toBe(true)
    })
  })
})
