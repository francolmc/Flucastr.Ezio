import { describe, it, expect, vi } from 'vitest'
import { sendSSEResponse } from '../sseResponse.js'
import type { MessagesResponse } from '../pipeline.js'

describe('sendSSEResponse', () => {
  it('emite secuencia completa de 6 eventos para content tipo text', () => {
    const mockRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    } as any

    const response: MessagesResponse = {
      id: 'msg_test-123',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content: [{ type: 'text', text: 'Hola mundo' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 5 }
    }

    sendSSEResponse(mockRes, response)

    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    const writes = mockRes.write.mock.calls
    const events = writes.map((call: unknown[]) => {
      const str = call[0] as string
      if (str.startsWith('event: ')) return { type: 'event', name: str.slice(7).trim() }
      if (str.startsWith('data: ')) return { type: 'data', content: JSON.parse(str.slice(6)) }
      return { type: 'other', content: str }
    })

    expect(events.filter((e: any) => e.type === 'event').map((e: any) => e.name))
      .toEqual(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'])

    const messageStart = events.find((e: any) => e.type === 'event' && e.name === 'message_start')
    expect(messageStart).toBeDefined()

    const contentBlockDelta = events.find((e: any) => e.type === 'data' && e.content.type === 'content_block_delta')
    expect(contentBlockDelta?.content.delta.text).toBe('Hola mundo')

    const messageDelta = events.find((e: any) => e.type === 'data' && e.content.type === 'message_delta')
    expect(messageDelta?.content.delta.stop_reason).toBe('end_turn')

    expect(mockRes.end).toHaveBeenCalled()
  })

  it('emite secuencia completa para content tipo tool_use', () => {
    const mockRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    } as any

    const response: MessagesResponse = {
      id: 'msg_tool-456',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content: [{
        type: 'tool_use',
        id: 'tool_abc123',
        name: 'web_search',
        input: { query: 'test query' }
      }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 3 }
    }

    sendSSEResponse(mockRes, response)

    const writes = mockRes.write.mock.calls
    const events = writes.map((call: unknown[]) => {
      const str = call[0] as string
      if (str.startsWith('event: ')) return { type: 'event', name: str.slice(7).trim() }
      if (str.startsWith('data: ')) return { type: 'data', content: JSON.parse(str.slice(6)) }
      return { type: 'other', content: str }
    })

    expect(events.filter((e: any) => e.type === 'event').map((e: any) => e.name))
      .toEqual(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'])

    const contentBlockStart = events.find((e: any) => e.type === 'data' && e.content.type === 'content_block_start')
    expect(contentBlockStart?.content.content_block.type).toBe('tool_use')
    expect(contentBlockStart?.content.content_block.name).toBe('web_search')

    const contentBlockDelta = events.find((e: any) => e.type === 'data' && e.content.type === 'content_block_delta')
    expect(contentBlockDelta?.content.delta.type).toBe('input_json_delta')
    expect(contentBlockDelta?.content.delta.partial_json).toBe('{"query":"test query"}')

    const messageDelta = events.find((e: any) => e.type === 'data' && e.content.type === 'message_delta')
    expect(messageDelta?.content.delta.stop_reason).toBe('tool_use')
  })
})
