import { describe, it, expect } from 'vitest'
import { diff, type L3Results } from '../diff-l3.js'

describe('diff-l3', () => {
  describe('diff', () => {
    it('detects regression from PASS to FAIL', () => {
      const oldResults: L3Results = {
        timestamp: '2026-07-26T10:00:00.000Z',
        scenarios: {
          c9: { result: 'PASS', passedRuns: 5, totalRuns: 5 }
        },
        passRate: '1/1'
      }
      const newResults: L3Results = {
        timestamp: '2026-07-26T11:00:00.000Z',
        scenarios: {
          c9: { result: 'FAIL', passedRuns: 0, totalRuns: 5 }
        },
        passRate: '0/1'
      }

      const { regressions, improvements, unchanged } = diff(oldResults, newResults)

      expect(regressions).toHaveLength(1)
      expect(regressions[0].scenario).toBe('c9')
      expect(regressions[0].oldResult).toBe('PASS')
      expect(regressions[0].newResult).toBe('FAIL')
      expect(improvements).toHaveLength(0)
      expect(unchanged).toHaveLength(0)
    })

    it('detects improvement from FAIL to PASS', () => {
      const oldResults: L3Results = {
        timestamp: '2026-07-26T10:00:00.000Z',
        scenarios: {
          c8: { result: 'FAIL', passedRuns: 0, totalRuns: 5 }
        },
        passRate: '0/1'
      }
      const newResults: L3Results = {
        timestamp: '2026-07-26T11:00:00.000Z',
        scenarios: {
          c8: { result: 'PASS', passedRuns: 5, totalRuns: 5 }
        },
        passRate: '1/1'
      }

      const { regressions, improvements, unchanged } = diff(oldResults, newResults)

      expect(improvements).toHaveLength(1)
      expect(improvements[0].scenario).toBe('c8')
      expect(improvements[0].oldResult).toBe('FAIL')
      expect(improvements[0].newResult).toBe('PASS')
      expect(regressions).toHaveLength(0)
      expect(unchanged).toHaveLength(0)
    })

    it('detects improvement from UNSTABLE to PASS', () => {
      const oldResults: L3Results = {
        timestamp: '2026-07-26T10:00:00.000Z',
        scenarios: {
          c10: { result: 'UNSTABLE', passedRuns: 3, totalRuns: 5 }
        },
        passRate: '0/1'
      }
      const newResults: L3Results = {
        timestamp: '2026-07-26T11:00:00.000Z',
        scenarios: {
          c10: { result: 'PASS', passedRuns: 5, totalRuns: 5 }
        },
        passRate: '1/1'
      }

      const { regressions, improvements, unchanged } = diff(oldResults, newResults)

      expect(improvements).toHaveLength(1)
      expect(improvements[0].scenario).toBe('c10')
      expect(improvements[0].oldResult).toBe('UNSTABLE')
      expect(improvements[0].newResult).toBe('PASS')
      expect(regressions).toHaveLength(0)
      expect(unchanged).toHaveLength(0)
    })

    it('reports unchanged scenarios', () => {
      const oldResults: L3Results = {
        timestamp: '2026-07-26T10:00:00.000Z',
        scenarios: {
          c1: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c2: { result: 'FAIL', passedRuns: 0, totalRuns: 5 }
        },
        passRate: '1/2'
      }
      const newResults: L3Results = {
        timestamp: '2026-07-26T11:00:00.000Z',
        scenarios: {
          c1: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c2: { result: 'FAIL', passedRuns: 0, totalRuns: 5 }
        },
        passRate: '1/2'
      }

      const { regressions, improvements, unchanged } = diff(oldResults, newResults)

      expect(unchanged).toContain('c1')
      expect(unchanged).toContain('c2')
      expect(regressions).toHaveLength(0)
      expect(improvements).toHaveLength(0)
    })

    it('handles multiple scenarios with mixed results', () => {
      const oldResults: L3Results = {
        timestamp: '2026-07-26T10:00:00.000Z',
        scenarios: {
          c1: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c8: { result: 'FAIL', passedRuns: 0, totalRuns: 5 },
          c9: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c10: { result: 'UNSTABLE', passedRuns: 3, totalRuns: 5 }
        },
        passRate: '2/4'
      }
      const newResults: L3Results = {
        timestamp: '2026-07-26T11:00:00.000Z',
        scenarios: {
          c1: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c8: { result: 'PASS', passedRuns: 5, totalRuns: 5 },
          c9: { result: 'FAIL', passedRuns: 0, totalRuns: 5 },
          c10: { result: 'PASS', passedRuns: 5, totalRuns: 5 }
        },
        passRate: '3/4'
      }

      const { regressions, improvements, unchanged } = diff(oldResults, newResults)

      expect(regressions).toHaveLength(1)
      expect(regressions[0].scenario).toBe('c9')
      expect(improvements).toHaveLength(2)
      expect(improvements.map(i => i.scenario)).toContain('c8')
      expect(improvements.map(i => i.scenario)).toContain('c10')
      expect(unchanged).toContain('c1')
    })
  })
})