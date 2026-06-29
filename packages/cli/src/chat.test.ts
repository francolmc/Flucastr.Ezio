import { describe, it, expect, vi } from 'vitest';
import { handleLine } from './chat';

describe('handleLine', () => {
  const createMockClient = () => ({
    send: vi.fn().mockResolvedValue('Hello back'),
    resolve: vi.fn().mockResolvedValue({
      wasComplex: false,
      complexity: { isComplex: false, reason: 'simple', suggestedSteps: 1 },
      plan: { summary: 'Simple', steps: [], id: '1', createdAt: new Date() },
      execution: { success: true, steps: [], failures: [], finalOutput: 'result' },
      verification: { isVerified: true, verificationReport: 'ok', issuesFound: [] },
      validationIterations: 0,
      userMessages: []
    })
  })

  it('returns null for exit command', async () => {
    const client = createMockClient()
    const result = await handleLine('exit', client as any)
    expect(result).toBeNull()
  })

  it('returns empty string for empty input', async () => {
    const client = createMockClient()
    const result = await handleLine('', client as any)
    expect(result).toBe('')
    expect(client.resolve).not.toHaveBeenCalled()
  })

  it('calls client.resolve and returns final output', async () => {
    const client = createMockClient()
    const result = await handleLine('test', client as any)
    expect(result).toBe('result')
    expect(client.resolve).toHaveBeenCalledWith('test')
  })

  it('returns error message if resolve throws', async () => {
    const client = createMockClient()
    client.resolve = vi.fn().mockRejectedValue(new Error('Test error'))
    const result = await handleLine('test', client as any)
    expect(result).toBe('Error: Test error')
  })
})
