import { describe, it, expect, vi } from 'vitest'
import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { CoreInput } from '../types/index'
import { Core } from '../Core'

describe('Core.process()', () => {
  const makeAdapter = (responses: string[]): ModelAdapter => {
    const fn = vi.fn()
    responses.forEach(r => fn.mockResolvedValueOnce(r))
    fn.mockResolvedValue('fallback response')
    return { complete: fn }
  }

  const baseInput = (overrides: Partial<CoreInput> = {}): CoreInput => ({
    message: 'hola',
    tools: [],
    toolExecutor: vi.fn().mockResolvedValue('tool result'),
    ...overrides
  })

  it('clasificación simple retorna respuesta directa sin stepResults', async () => {
    const adapter = makeAdapter([
      '{"level":"simple","reason":"greeting"}',
      'hola, ¿cómo puedo ayudarte?'
    ])
    const core = new Core(adapter)
    const output = await core.process(baseInput())
    expect(output.classification).toBe('simple')
    expect(output.stepResults).toHaveLength(0)
    expect(output.response).toBe('hola, ¿cómo puedo ayudarte?')
  })

  it('clasificación simple no llama al toolExecutor', async () => {
    const adapter = makeAdapter([
      '{"level":"simple","reason":"greeting"}',
      'respuesta directa'
    ])
    const toolExecutor = vi.fn().mockResolvedValue('tool result')
    const core = new Core(adapter)
    await core.process(baseInput({ toolExecutor }))
    expect(toolExecutor).not.toHaveBeenCalled()
  })

  it('si el adapter falla en classify, process() propaga el error', async () => {
    const adapter: ModelAdapter = {
      complete: vi.fn().mockRejectedValue(new Error('adapter error'))
    }
    const core = new Core(adapter)
    await expect(core.process(baseInput())).rejects.toThrow('adapter error')
  })

  it('acepta CoreInput sin systemPrompt sin lanzar error', async () => {
    const adapter = makeAdapter([
      '{"level":"simple","reason":"ok"}',
      'respuesta'
    ])
    const core = new Core(adapter)
    const output = await core.process(baseInput({ systemPrompt: undefined }))
    expect(output.response).toBeTruthy()
  })

  it('acepta el campo isSubAgent en CoreInput sin lanzar error', async () => {
    const adapter = makeAdapter([
      '{"level":"simple","reason":"ok"}',
      'respuesta'
    ])
    const core = new Core(adapter)
    const output = await core.process(baseInput({ isSubAgent: true }))
    expect(output.classification).toBe('simple')
  })
})
