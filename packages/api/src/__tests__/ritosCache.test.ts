import { describe, it, expect, vi } from 'vitest'
import { lookupPattern, recordPattern } from '../ritosCache.js'

describe('ritosCache', () => {
  describe('lookupPattern', () => {
    it('con match devuelve found:true y guiaText formateado correctamente', () => {
      const mockRitos = {
        findRito: vi.fn().mockReturnValue({
          rito: {
            id: 'rito-1',
            userId: 'user-1',
            objectiveText: 'busca info sobre Argentina',
            planSummary: '',
            toolsUsed: ['web_search'],
            resultSummary: 'encontro info',
            guia: 'Usa web_search con query apropiada',
            usoCount: 1,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          similarity: 0.85
        })
      }

      const result = lookupPattern(mockRitos as any, 'user-1', 'busca info sobre Argentina')

      expect(result.found).toBe(true)
      expect(result.guiaText).toBe('[RITO_PATTERN]\nUsa web_search con query apropiada\n[/RITO_PATTERN]')
      expect(result.similarity).toBe(0.85)
    })

    it('sin match devuelve found:false y guiaText:null', () => {
      const mockRitos = {
        findRito: vi.fn().mockReturnValue(null)
      }

      const result = lookupPattern(mockRitos as any, 'user-1', 'algo sin match')

      expect(result.found).toBe(false)
      expect(result.guiaText).toBe(null)
      expect(result.similarity).toBeUndefined()
    })
  })

  describe('recordPattern', () => {
    it('con saveRito que lanza error no propaga el error', async () => {
      const mockRitos = {
        saveRito: vi.fn().mockRejectedValue(new Error('DB error'))
      }
      const loggerWarn = vi.fn()
      vi.doMock('@ezio/core', () => ({
        ...vi.importActual('@ezio/core'),
        createLogger: () => ({ warn: loggerWarn })
      }))

      await expect(recordPattern(
        mockRitos as any,
        'user-1',
        'objetivo test',
        ['web_search'],
        'resultado test',
        'guia test'
      )).resolves.toBeUndefined()

      expect(mockRitos.saveRito).toHaveBeenCalledWith(
        'user-1',
        'objetivo test',
        ['web_search'],
        'resultado test',
        'guia test'
      )
    })
  })
})