import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import { Classifier } from '../Classifier'

describe('Classifier', () => {
  let fakeAdapter: ModelAdapter

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn()
    }
  })

  it('adapter returns JSON {"level":"simple",...} → level: simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hello')
    expect(result.level).toBe('simple')
  })

  it('adapter returns JSON {"level":"moderate",...} → level: moderate', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"moderate","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('search for something')
    expect(result.level).toBe('moderate')
  })

  it('adapter returns JSON {"level":"complex",...} → level: complex', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"complex","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('complex task')
    expect(result.level).toBe('complex')
  })

  it('adapter returns JSON with level in uppercase "SIMPLE" → level: simple (normalization)', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"SIMPLE","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hello')
    expect(result.level).toBe('simple')
  })

  it('adapter returns non-parseable text → level: simple (fallback)', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('not json at all')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hello')
    expect(result.level).toBe('simple')
  })

  it('adapter returns JSON with invalid level "ultra" → level: simple (fallback)', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"ultra","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hello')
    expect(result.level).toBe('simple')
  })

  it('adapter throws error → level: simple (fallback, does not propagate error)', async () => {
    fakeAdapter.complete = vi.fn().mockRejectedValue(new Error('adapter error'))
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hello')
    expect(result.level).toBe('simple')
  })

  it('prompt sent to adapter includes user message', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    await classifier.classify('my specific message')
    expect(fakeAdapter.complete).toHaveBeenCalled()
    const call = fakeAdapter.complete.mock.calls[0][0]
    expect(call[0].content).toContain('my specific message')
  })

  it('if sessionContext is passed, prompt includes it', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    await classifier.classify('hello', 'user is logged in')
    const call = fakeAdapter.complete.mock.calls[0][0]
    expect(call[0].content).toContain('CONTEXT')
    expect(call[0].content).toContain('user is logged in')
  })

  it('if sessionContext is NOT passed, prompt does not include CONTEXT block', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    await classifier.classify('hello')
    const call = fakeAdapter.complete.mock.calls[0][0]
    expect(call[0].content).not.toContain('CONTEXT:')
  })
})
