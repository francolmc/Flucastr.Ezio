import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { Verifier } from '../Verifier'

describe('Verifier', () => {
  let fakeAdapter: ModelAdapter

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn()
    }
  })

  it('when adapter returns "YES ..." → approved: true', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('YES - the objective was accomplished')
    const verifier = new Verifier(fakeAdapter)
    const result = await verifier.verify('do something', 'result data')
    expect(result.approved).toBe(true)
  })

  it('when adapter returns "NO ..." → approved: false', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('NO - the objective was not accomplished')
    const verifier = new Verifier(fakeAdapter)
    const result = await verifier.verify('do something', 'result data')
    expect(result.approved).toBe(false)
  })

  it('when adapter returns "yes" in lowercase → approved: true (case-insensitive)', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('yes - the objective was accomplished')
    const verifier = new Verifier(fakeAdapter)
    const result = await verifier.verify('do something', 'result data')
    expect(result.approved).toBe(true)
  })

  it('when adapter returns ambiguous text without YES or NO → approved: true, reason contains assuming approved', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('Maybe, it could be considered complete')
    const verifier = new Verifier(fakeAdapter)
    const result = await verifier.verify('do something', 'result data')
    expect(result.approved).toBe(true)
    expect(result.reason).toContain('assuming approved')
  })

  it('when adapter returns "YES" without additional reason → approved: true, no error', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('YES')
    const verifier = new Verifier(fakeAdapter)
    const result = await verifier.verify('do something', 'result data')
    expect(result.approved).toBe(true)
  })

  it('when adapter throws error → the error propagates', async () => {
    const error = new Error('adapter failure')
    fakeAdapter.complete = vi.fn().mockRejectedValue(error)
    const verifier = new Verifier(fakeAdapter)
    await expect(verifier.verify('do something', 'result data')).rejects.toThrow('adapter failure')
  })
})
