import { describe, it, expect, vi } from 'vitest'
import { runPipeline } from '../pipeline.js'
import type { AnthropicToolSchema } from '../types.js'

const TOOLS: AnthropicToolSchema[] = [
  {
    name: 'web_search',
    description: 'Search the web',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read a file',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  }
]

const MANY_TOOLS: AnthropicToolSchema[] = Array.from({ length: 15 }, (_, i) => ({
  name: `tool_${i}`,
  description: `Tool number ${i}`,
  input_schema: {
    type: 'object',
    properties: { value: { type: 'string' } }
  }
}))

const mockAdapter = () => ({
  complete: vi.fn()
})

describe('runPipeline', () => {
  it('Caso A: plain text response when no tool call needed', async () => {
    const adapter = mockAdapter()
    adapter.complete
      .mockResolvedValueOnce('{"level":"simple","reason":"greeting"}')
      .mockResolvedValueOnce('Hola! Como estas?')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'hola, como estas' }]
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hola! Como estas?' })
  })

  it('Caso B: returns tool_use when FormVerifier approves', async () => {
    const adapter = mockAdapter()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should search the web for information about Argentina.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina news"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'web_search',
      input: { query: 'Argentina news' }
    })
  })

  it('Caso C: throws error when FormVerifier rejects twice', async () => {
    const adapter = mockAdapter()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search with query "Argentina".')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina"}}')
      .mockResolvedValueOnce('NO')
      .mockResolvedValueOnce('I should use read_file instead.')
      .mockResolvedValueOnce('{"tool":"read_file","input":{"path":"notes.txt"}}')
      .mockResolvedValueOnce('NO')

    await expect(runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    })).rejects.toThrow('Verification rejected after retry')
  })

  it('Caso D: with more tools than threshold, tool retriever filters and result respects maxTools', async () => {
    const adapter = mockAdapter()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"use a tool"}')
      .mockResolvedValueOnce('tool_3')
      .mockResolvedValueOnce('I should use tool_3.')
      .mockResolvedValueOnce('{"tool":"tool_3","input":{"value":"test"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do something with tool_3' }],
      tools: MANY_TOOLS
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'tool_3',
      input: { value: 'test' }
    })
  })
})
