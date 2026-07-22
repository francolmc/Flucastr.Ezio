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

  it('generates pure content (mermaid diagram) without persistence request → simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"content generation only, no persistence requested"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('genera un diagrama de secuencia en mermaid')
    expect(result.level).toBe('simple')
  })

  it('generates content AND asks to save it → moderate', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"moderate","reason":"one write_file call after generating content"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('genera un diagrama en mermaid y guárdalo en un archivo')
    expect(result.level).toBe('moderate')
  })

  it('pure content generation: SQL query example → simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"content generation only"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('dame un ejemplo de query SQL para esto')
    expect(result.level).toBe('simple')
  })

  it('pure content generation: poem → simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"content generation only"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('escribe un poema sobre el mar')
    expect(result.level).toBe('simple')
  })

  it('regression: greeting still classifies as simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"greeting"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hola')
    expect(result.level).toBe('simple')
  })

  it('regression: list files still classifies as moderate', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"moderate","reason":"one list_directory call"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('lista mis archivos')
    expect(result.level).toBe('moderate')
  })

  it('regression: multi-step analyze + write still classifies as complex', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"complex","reason":"analyze + create/write = 2+ chained tools"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('analiza mi carpeta y crea un resumen')
    expect(result.level).toBe('complex')
  })

  it('with dateContext set, "el partido de mañana de Argentina en el mundial" should not classify as simple', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"moderate","reason":"references a relative future date, needs a live web_search for the current schedule"}')
    const classifier = new Classifier(fakeAdapter)
    const dateContext = 'Current date: Saturday, July 11, 2026 (2026-07-11). Current local time: 14:30 (timezone: America/Argentina/Buenos_Aires).'
    const result = await classifier.classify('el partido de mañana de Argentina en el mundial', undefined, dateContext)
    expect(result.level).not.toBe('simple')
    expect(result.level).toBe('moderate')
  })

  it('if dateContext is passed, prompt includes it', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"moderate","reason":"test"}')
    const classifier = new Classifier(fakeAdapter)
    const dateContext = 'Current date: Saturday, July 11, 2026 (2026-07-11). Current local time: 14:30 (timezone: America/Argentina/Buenos_Aires).'
    await classifier.classify('el partido de mañana de Argentina', undefined, dateContext)
    const call = fakeAdapter.complete.mock.calls[0][0]
    expect(call[0].content).toContain('Current date:')
    expect(call[0].content).toContain('2026-07-11')
  })

  it('regression: classify without dateContext (optional parameter) still works', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"level":"simple","reason":"greeting"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hola')
    expect(result.level).toBe('simple')
  })

  it('auto-correct: requires_environment_action=true + level=simple → level becomes moderate', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"requires_environment_action":true,"level":"simple","reason":"lists files"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('lista los archivos en este directorio')
    expect(result.level).toBe('moderate')
  })

  it('auto-correct: requires_environment_action=false + level=simple → no correction applied', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"requires_environment_action":false,"level":"simple","reason":"greeting"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('hola')
    expect(result.level).toBe('simple')
  })

  it('auto-correct: requires_environment_action=true + level=moderate → no correction applied', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('{"requires_environment_action":true,"level":"moderate","reason":"one list_directory call"}')
    const classifier = new Classifier(fakeAdapter)
    const result = await classifier.classify('lista mis archivos')
    expect(result.level).toBe('moderate')
  })
})
