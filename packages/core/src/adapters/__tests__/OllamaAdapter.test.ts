import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OllamaAdapter } from '../OllamaAdapter'

describe('OllamaAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('complete() with successful response returns text', async () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama2' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Hello world' } })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    const result = await adapter.complete([{ role: 'user', content: 'Hi' }])

    expect(result).toBe('Hello world')
  })

  it('complete() with HTTP error throws Error with status code', async () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama2' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await expect(adapter.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'Ollama API error: 401 - Unauthorized'
    )
  })

  it('complete() sends correct request body', async () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama2' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'response' } })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await adapter.complete([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' }
    ])

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama2',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' }
        ],
        stream: false,
        options: { temperature: 0.7 }
      })
    }))
  })
})