import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ChatMessage, ModelAdapter } from '../adapters/ModelAdapter'
import { Core } from '../Core'

describe('Core', () => {
  let fakeAdapter: ModelAdapter

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn().mockResolvedValue('respuesta de prueba')
    }
  })

  it('new Core(fakeAdapter).chat("hola") retorna respuesta de prueba', async () => {
    const core = new Core(fakeAdapter)
    const result = await core.chat('hola')
    expect(result).toBe('respuesta de prueba')
  })

  it('chat() llama a adapter.complete() con el array de mensajes correcto, incluyendo el mensaje nuevo al final', async () => {
    const core = new Core(fakeAdapter)
    await core.chat('hola')
    expect(fakeAdapter.complete).toHaveBeenCalledWith([
      { role: 'user', content: 'hola' }
    ])
  })

  it('chat() con history previo pasa ese history completo + el mensaje nuevo al adapter, en el orden correcto', async () => {
    const core = new Core(fakeAdapter)
    const history: ChatMessage[] = [
      { role: 'user', content: 'primer mensaje' },
      { role: 'assistant', content: 'respuesta anterior' }
    ]
    await core.chat('mensaje nuevo', history)
    expect(fakeAdapter.complete).toHaveBeenCalledWith([
      { role: 'user', content: 'primer mensaje' },
      { role: 'assistant', content: 'respuesta anterior' },
      { role: 'user', content: 'mensaje nuevo' }
    ])
  })

  it('chat() no muta el array history original pasado como argumento', async () => {
    const core = new Core(fakeAdapter)
    const history: ChatMessage[] = [
      { role: 'user', content: 'primer mensaje' }
    ]
    const originalLength = history.length
    await core.chat('mensaje nuevo', history)
    expect(history.length).toBe(originalLength)
    expect(history).toEqual([{ role: 'user', content: 'primer mensaje' }])
  })

  it('si adapter.complete() rechaza, chat() propaga el mismo error', async () => {
    const error = new Error('error del adapter')
    fakeAdapter.complete = vi.fn().mockRejectedValue(error)
    const core = new Core(fakeAdapter)
    await expect(core.chat('hola')).rejects.toThrow('error del adapter')
  })
})
