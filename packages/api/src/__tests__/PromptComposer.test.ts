import { describe, it, expect, afterEach } from 'vitest'
import { PromptComposer } from '../PromptComposer.js'

describe('PromptComposer', () => {
  const composer = new PromptComposer()

  afterEach(() => {
    delete process.env.EZIO_DISABLE_ANTISC
    delete process.env.EZIO_DISABLE_LITERALFIDELITY
    delete process.env.EZIO_DISABLE_CONTENTTRANSFORM
  })

  describe('compose', () => {
    it('todas las señales en false, sin env vars, incluye solo anti-self-conditioning', () => {
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: false,
        needsContentTransform: false
      })
      expect(result).toContain('Important: if an earlier assistant turn')
      expect(result).not.toContain('exact name for a file')
      expect(result).not.toContain('RESULT of combining, concatenating, or computing')
    })

    it('hasLiteralIdentifier true, needsContentTransform false → solo nota de identificador literal', () => {
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: true,
        needsContentTransform: false
      })
      expect(result).toContain('exact name for a file')
      expect(result).toContain('Important: if an earlier assistant turn')
      expect(result).not.toContain('RESULT of combining, concatenating, or computing')
    })

    it('hasLiteralIdentifier true, needsContentTransform true → ambas notas en orden de priority', () => {
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: true,
        needsContentTransform: true
      })
      expect(result).toContain('exact name for a file')
      expect(result).toContain('RESULT of combining, concatenating, or computing')
      const literalIdx = result.indexOf('exact name for a file')
      const transformIdx = result.indexOf('RESULT of combining')
      expect(literalIdx).toBeLessThan(transformIdx)
    })

    it('con EZIO_DISABLE_LITERALFIDELITY=true, aunque hasLiteralIdentifier true, la nota NO se incluye', () => {
      process.env.EZIO_DISABLE_LITERALFIDELITY = 'true'
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: true,
        needsContentTransform: false
      })
      expect(result).not.toContain('exact name for a file')
      expect(result).toContain('Important: if an earlier assistant turn')
    })

    it('con EZIO_DISABLE_ANTISC=true, la nota anti-self-conditioning NO se incluye', () => {
      process.env.EZIO_DISABLE_ANTISC = 'true'
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: false,
        needsContentTransform: false
      })
      expect(result).toBe('')
    })

    it('con EZIO_DISABLE_CONTENTTRANSFORM=true, aunque needsContentTransform true, la nota NO se incluye', () => {
      process.env.EZIO_DISABLE_CONTENTTRANSFORM = 'true'
      const result = composer.compose({
        requiresEnvironmentAction: false,
        hasLiteralIdentifier: true,
        needsContentTransform: true
      })
      expect(result).toContain('exact name for a file')
      expect(result).not.toContain('RESULT of combining, concatenating, or computing')
    })
  })
})