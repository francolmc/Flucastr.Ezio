import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GoogleAdapter } from '../GoogleAdapter'

describe('GoogleAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('complete() with successful response returns text', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-pro' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }]
      })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    const result = await adapter.complete([{ role: 'user', content: 'Hi' }])

    expect(result).toBe('Hello from Gemini')
  })

  it('complete() with HTTP error throws Error with status code', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-pro' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request'
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await expect(adapter.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'Google API error: 400 - Bad Request'
    )
  })

  it('complete() sends correct request body with system instruction', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-pro' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'response' }] } }]
      })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await adapter.complete([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' }
    ])

    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchCall[1].body as string)

    expect(fetchCall[0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=test-key')
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are helpful' }] })
  })

  it('complete() converts assistant role to model in contents', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-pro' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'response' }] } }]
      })
    }) as unknown as typeof fetch
    globalThis.fetch = mockFetch

    await adapter.complete([
      { role: 'assistant', content: 'Hello, I am an assistant' }
    ])

    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchCall[1].body as string)

    expect(body.contents[0].role).toBe('model')
  })
})