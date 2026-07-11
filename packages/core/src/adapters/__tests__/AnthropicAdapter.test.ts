import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AnthropicAdapter } from '../AnthropicAdapter'

describe('AnthropicAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('complete() with successful response returns text', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-3-sonnet' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello from Claude' }]
      })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    const result = await adapter.complete([{ role: 'user', content: 'Hi' }])

    expect(result).toBe('Hello from Claude')
  })

  it('complete() with HTTP error throws Error with status code', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-3-sonnet' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await expect(adapter.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'Anthropic API error: 401 - Unauthorized'
    )
  })

  it('complete() sends correct request body with system message', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-3-sonnet' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'response' }] })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await adapter.complete([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' }
    ])

    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchCall[1].body as string)

    expect(body).toEqual({
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 4096,
      temperature: 0.7,
      system: 'You are helpful'
    })
    expect(fetchCall[1].headers).toEqual({
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    })
  })

  it('complete() without system message does not include system field', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-3-sonnet' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'response' }] })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await adapter.complete([{ role: 'user', content: 'Hello' }])

    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchCall[1].body as string)

    expect(body.system).toBeUndefined()
  })
})