import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChat = vi.fn().mockResolvedValue('mocked response')

vi.mock('@ezio/core', async () => {
  const actual = await vi.importActual('@ezio/core')
  return {
    ...actual,
    Core: vi.fn(() => ({ chat: mockChat }))
  }
})

import { EzioClient } from '../EzioClient'

describe('EzioClient', () => {
  beforeEach(() => {
    mockChat.mockClear()
    mockChat.mockResolvedValue('mocked response')
  })

  it('send("hola") returns what the mocked Core.chat() resolves', async () => {
    mockChat.mockResolvedValue('hello from assistant')

    const client = new EzioClient()
    const result = await client.send('hola')

    expect(result).toBe('hello from assistant')
  })

  it('after send(), getHistory() contains user and assistant messages in correct order', async () => {
    const client = new EzioClient()
    await client.send('hello')

    const history = client.getHistory()
    expect(history).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'mocked response' }
    ])
  })

  it('second send() call passes accumulated history to Core.chat()', async () => {
    const client = new EzioClient()
    await client.send('first')
    await client.send('second')

    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(mockChat).toHaveBeenNthCalledWith(1, 'first', [])
    expect(mockChat).toHaveBeenNthCalledWith(2, 'second', [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'mocked response' }
    ])
  })

  it('getHistory() returns a copy - mutating returned array does not affect internal state', async () => {
    const client = new EzioClient()
    await client.send('hello')

    const history1 = client.getHistory()
    const history2 = client.getHistory()

    history1.push({ role: 'user', content: 'tampered' })

    expect(history2).toHaveLength(2)
    expect(client.getHistory()).toHaveLength(2)
  })

  it('clearHistory() leaves getHistory() empty, and next send() calls Core.chat() with empty history', async () => {
    const client = new EzioClient()
    await client.send('first')
    client.clearHistory()

    expect(client.getHistory()).toEqual([])

    await client.send('second')

    expect(mockChat).toHaveBeenLastCalledWith('second', [])
  })
})