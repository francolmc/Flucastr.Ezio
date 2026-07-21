import { describe, it, expect, vi } from 'vitest'
import { pruneHistory } from '../historyPruning.js'
import type { ChatMessage } from '@ezio/core'

const mockAdapter = () => ({
  complete: vi.fn()
})

const makeMessages = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}`
  }))

describe('pruneHistory', () => {
  it('returns unchanged when messages.length <= threshold', async () => {
    const adapter = mockAdapter()
    const messages = makeMessages(8)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.messages).toBe(messages)
    expect(result.summary).toBeNull()
    expect(adapter.complete).not.toHaveBeenCalled()
  })

  it('returns unchanged when messages.length < threshold (boundary)', async () => {
    const adapter = mockAdapter()
    const messages = makeMessages(7)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.messages).toBe(messages)
    expect(result.summary).toBeNull()
    expect(adapter.complete).not.toHaveBeenCalled()
  })

  it('when messages.length > threshold, adapter.complete IS called', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce('{}')
    const messages = makeMessages(9)

    await pruneHistory(adapter as any, messages, { pruneThreshold: 8 })

    expect(adapter.complete).toHaveBeenCalledTimes(1)
  })

  it('messages.length > threshold, adapter returns valid JSON -> summary not-null, messages === keepLastTurns', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce(JSON.stringify({
      user_goal: 'test goal',
      completed: ['step 1'],
      established_facts: ['fact 1'],
      pending: 'step 2',
      last_tool_results: { tool_a: 'ok' }
    }))
    const messages = makeMessages(10)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.summary).not.toBeNull()
    expect(result.messages).toHaveLength(4)
    expect(result.messages[0].content).toBe('Message 6')
  })

  it('messages.length > threshold, adapter returns unparseable text -> summary null, messages are last keepLastTurns (safe fallback)', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce('this is not JSON at all')
    const messages = makeMessages(10)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.summary).toBeNull()
    expect(result.messages).toHaveLength(4)
    expect(result.messages[0].content).toBe('Message 6')
  })

  it('messages.length > threshold, adapter returns JSON without user_goal field -> treats as invalid, returns safe fallback', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce(JSON.stringify({
      completed: ['step 1'],
      established_facts: ['fact 1'],
      pending: 'step 2',
      last_tool_results: {}
    }))
    const messages = makeMessages(10)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.summary).toBeNull()
    expect(result.messages).toHaveLength(4)
  })

  it('keepLastTurns=2 keeps only last 2 messages', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce(JSON.stringify({
      user_goal: 'goal',
      completed: [],
      established_facts: [],
      pending: '',
      last_tool_results: {}
    }))
    const messages = makeMessages(12)

    const result = await pruneHistory(adapter as any, messages, { keepLastTurns: 2 })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].content).toBe('Message 10')
  })

  it('summary text contains CONVERSATION_SUMMARY markers', async () => {
    const adapter = mockAdapter()
    adapter.complete.mockResolvedValueOnce(JSON.stringify({
      user_goal: 'main goal',
      completed: ['action 1'],
      established_facts: ['key fact'],
      pending: 'remaining task',
      last_tool_results: { search: 'found info' }
    }))
    const messages = makeMessages(10)

    const result = await pruneHistory(adapter as any, messages)

    expect(result.summary).toContain('[CONVERSATION_SUMMARY]')
    expect(result.summary).toContain('[/CONVERSATION_SUMMARY]')
    expect(result.summary).toContain('Goal: main goal')
    expect(result.summary).toContain('Completed:')
    expect(result.summary).toContain('- action 1')
  })
})
