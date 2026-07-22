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
  description: `Tool number ${i} with a moderately long description to ensure the total token count exceeds the filtering threshold. `.repeat(15) + `Tool ${i} does something useful.`,
  input_schema: {
    type: 'object',
    properties: { value: { type: 'string' } }
  }
}))

const LONG_DESCRIPTION = 'A'.repeat(3000)
const BIG_TOOLS: AnthropicToolSchema[] = [
  {
    name: 'tool_a',
    description: `This is a very long description for tool_a that contains detailed information about what this tool does. ${LONG_DESCRIPTION}`,
    input_schema: { type: 'object', properties: { value: { type: 'string' } } }
  },
  {
    name: 'tool_b',
    description: `This is a very long description for tool_b that contains detailed information about what this tool does. ${LONG_DESCRIPTION}`,
    input_schema: { type: 'object', properties: { value: { type: 'string' } } }
  },
  {
    name: 'tool_c',
    description: `This is a very long description for tool_c that contains detailed information about what this tool does. ${LONG_DESCRIPTION}`,
    input_schema: { type: 'object', properties: { value: { type: 'string' } } }
  }
]

const mockAdapter = () => ({
  complete: vi.fn()
})

const mockRitos = () => ({
  findRito: vi.fn().mockReturnValue(null),
  saveRito: vi.fn().mockResolvedValue(undefined)
})

describe('runPipeline', () => {
  it('Caso A: plain text response when no tool call needed', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"simple","reason":"greeting"}')
      .mockResolvedValueOnce('Hola! Como estas?')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'hola, como estas' }]
    }, ritos as any, 'test-user', 'test-model')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'Hola! Como estas?' })
    expect(result.id).toMatch(/^msg_/)
    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.model).toBe('test-model')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.stop_sequence).toBe(null)
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: expect.any(Number) })
  })

  it('Caso B: returns tool_use when FormVerifier approves', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should search the web for information about Argentina.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina news"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'web_search',
      input: { query: 'Argentina news' }
    })
    expect(result.content[0]).toHaveProperty('id')
    expect(result.stop_reason).toBe('tool_use')
  })

  it('Caso C: throws error when FormVerifier rejects twice', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
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
    }, ritos as any, 'test-user', 'test-model')).rejects.toThrow('Verification rejected after retry')

    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Caso D: with more tools than threshold, tool retriever filters and result respects maxTools', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"use a tool"}')
      .mockResolvedValueOnce('tool_3')
      .mockResolvedValueOnce('I should use tool_3.')
      .mockResolvedValueOnce('{"tool":"tool_3","input":{"value":"test"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do something with tool_3' }],
      tools: MANY_TOOLS
    }, ritos as any, 'test-user', 'test-model')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'tool_3',
      input: { value: 'test' }
    })
    expect(result.content[0]).toHaveProperty('id')
  })

  it('Con RitosService con match: el system incluye el bloque [RITO_PATTERN]', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    ritos.findRito.mockReturnValue({
      rito: {
        id: 'rito-1',
        userId: 'test-user',
        objectiveText: 'busca info sobre Argentina',
        planSummary: '',
        toolsUsed: ['web_search'],
        resultSummary: 'encontro info',
        guia: 'Usa web_search con query apropiada',
        usoCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      similarity: 0.85
    })
    adapter.complete
      .mockResolvedValueOnce('{"level":"simple","reason":"greeting"}')
      .mockResolvedValueOnce('Hola! Como estas?')

    await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }]
    }, ritos as any, 'test-user', 'test-model')

    const systemCalls = adapter.complete.mock.calls.filter(call => call[0][0].role === 'system')
    expect(systemCalls.length).toBeGreaterThan(0)
    const completionSystemMsg = systemCalls[1][0][0].content
    expect(completionSystemMsg).toContain('[RITO_PATTERN]')
    expect(completionSystemMsg).toContain('Usa web_search con query apropiada')
    expect(completionSystemMsg).toContain('[/RITO_PATTERN]')
  })

  it('Con FormVerifier rechazando dos veces: ritos.saveRito NUNCA se llama', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search with query "Argentina".')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina"}}')
      .mockResolvedValueOnce('NO')
      .mockResolvedValueOnce('I should use read_file instead.')
      .mockResolvedValueOnce('{"tool":"read_file","input":{"path":"notes.txt"}}')
      .mockResolvedValueOnce('NO')

    try {
      await runPipeline(adapter as any, {
        messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
        tools: TOOLS
      }, ritos as any, 'test-user', 'test-model')
    } catch (_) { }

    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Token-based threshold: with 3 large tools (>2000 tokens estimated), filtering is triggered even though count < 12', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"use a tool"}')
      .mockResolvedValueOnce('tool_b')
      .mockResolvedValueOnce('I should use tool_b.')
      .mockResolvedValueOnce('{"tool":"tool_b","input":{"value":"test"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'use tool_b' }],
      tools: BIG_TOOLS
    }, ritos as any, 'test-user', 'test-model')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'tool_b',
      input: { value: 'test' }
    })
    expect(result.content[0]).toHaveProperty('id')
  })
})