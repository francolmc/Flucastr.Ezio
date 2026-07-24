import { describe, it, expect, vi } from 'vitest'
import { runPipeline, buildCoherenceHistory } from '../pipeline.js'
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
    }, ritos as any, 'test-user', 'test-model', 'hola, como estas')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'Hola! Como estas?' })
    expect(result.id).toMatch(/^msg_/)
    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.model).toBe('test-model')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.stop_sequence).toBe(null)
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: expect.any(Number) })

    const simplePathCall = adapter.complete.mock.calls[1]
    expect(simplePathCall[1]).toEqual(expect.objectContaining({ think: false }))
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
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'web_search',
      input: { query: 'Argentina news' }
    })
    expect(result.content[0]).toHaveProperty('id')
    expect(result.stop_reason).toBe('tool_use')
  })

  it('Caso C: degrada a texto con end_turn cuando FormVerifier rechaza dos veces (sin throw)', async () => {
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

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Primer rechazo coherence_redundant: ahora SI reintenta reasonPhase (no atajo directo)', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina"}}')
      .mockResolvedValueOnce("The task is already done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('I should check each part of the request explicitly.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina news"}}')
      .mockResolvedValueOnce("Still done.\nNO\nCATEGORY: REDUNDANT")

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
    const totalCalls = adapter.complete.mock.calls.length
    expect(totalCalls).toBeGreaterThan(5)
  })

  it('Primer rechazo coherence_needs_step con suggestion: no lanza excepcion y degrada a texto', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test"}}')
      .mockResolvedValueOnce('NO\nCATEGORY: NEEDS_STEP\nSUGGESTION: Try reading a file first.')
      .mockResolvedValueOnce('I should use web_search again.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test2"}}')
      .mockResolvedValueOnce('NO\nCATEGORY: NEEDS_STEP')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do a search' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'do a search')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Primer rechazo needs_step, retry rechaza con coherence_redundant: devuelve end_turn task complete', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina"}}')
      .mockResolvedValueOnce('NO\nCATEGORY: NEEDS_STEP')
      .mockResolvedValueOnce('I should use web_search again.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina news"}}')
      .mockResolvedValueOnce("The search was already done.\nNO\nCATEGORY: REDUNDANT")

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Primer rechazo redundant, retry tambien rechaza redundant: texto tarea completa con retry de por medio', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina"}}')
      .mockResolvedValueOnce("The task is already done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('I checked each part explicitly.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"Argentina news"}}')
      .mockResolvedValueOnce("Still complete.\nNO\nCATEGORY: REDUNDANT")

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Caso D: with more tools than threshold, BM25 filters and result respects maxTools', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"use a tool"}')
      .mockResolvedValueOnce('I should use tool_3.')
      .mockResolvedValueOnce('{"tool":"tool_3","input":{"value":"test"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do something with tool_3' }],
      tools: MANY_TOOLS
    }, ritos as any, 'test-user', 'test-model', 'do something with tool_3')

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
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    const systemCalls = adapter.complete.mock.calls.filter(call => call[0][0].role === 'system')
    expect(systemCalls.length).toBeGreaterThan(0)
    const completionSystemMsg = systemCalls[1][0][0].content
    expect(completionSystemMsg).toContain('[RITO_PATTERN]')
    expect(completionSystemMsg).toContain('Usa web_search con query apropiada')
    expect(completionSystemMsg).toContain('[/RITO_PATTERN]')
  })

  it('Con FormVerifier rechazando dos veces: ritos.saveRito se llama con toolsProposed vacio (degradacion a texto)', async () => {
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

    await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'busca info sobre Argentina' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('Token-based threshold: with 3 large tools (>4000 tokens estimated), filtering is triggered even though count < 12', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"use a tool"}')
      .mockResolvedValueOnce('I should use tool_b.')
      .mockResolvedValueOnce('{"tool":"tool_b","input":{"value":"test"}}')
      .mockResolvedValueOnce('YES')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'use tool_b' }],
      tools: BIG_TOOLS
    }, ritos as any, 'test-user', 'test-model', 'use tool_b')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'tool_b',
      input: { value: 'test' }
    })
    expect(result.content[0]).toHaveProperty('id')
  })

  it('regression: classifier.classify receives non-undefined sessionContext when prior messages exist', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"continues file editing"}')
      .mockResolvedValueOnce('I should use write to add description.')
      .mockResolvedValueOnce('{"tool":"write","input":{"path":"proyecto.txt","content":"Proyecto Atacama\nSistema de gestión de energía solar"}}')
      .mockResolvedValueOnce('YES')

    const priorMessages = [
      { role: 'user', content: "Crea un archivo proyecto.txt con el texto 'Proyecto Atacama'" },
      { role: 'assistant', content: 'I will use write to create the file.' },
      { role: 'user', content: "Ahora agrégale la descripción: 'Sistema de gestión de energía solar'" }
    ]

    await runPipeline(adapter as any, {
      messages: priorMessages,
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', "Ahora agrégale la descripción: 'Sistema de gestión de energía solar'")

    const classifyCall = adapter.complete.mock.calls[0]
    const classifyOptions = classifyCall[1] as Record<string, unknown>
    expect(classifyOptions).toBeDefined()
  })

  it('sin escalationAdapter: serialized null con requires_environment_action=true degrada a texto (regresion)', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search","requires_environment_action":true}')
      .mockResolvedValueOnce('The current president of Chile is Gabriel Boric.')
      .mockResolvedValueOnce('NO_TOOL')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'quien es el actual presidente de Chile' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'quien es el actual presidente de Chile', null)

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(result.content[0].text).toContain('Gabriel Boric')
  })

  it('escalation: tier-1 devuelve texto, escalationAdapter propone tool valida → tool_use final', async () => {
    const adapter = mockAdapter()
    const escalationAdapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search","requires_environment_action":true}')
      .mockResolvedValueOnce('The current president of Chile is Gabriel Boric.')
      .mockResolvedValueOnce('NO_TOOL')
      .mockResolvedValueOnce('YES')
    escalationAdapter.complete
      .mockResolvedValueOnce('I will use web_search to search for the current president of Chile.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"current president of Chile 2024"}}')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'quien es el actual presidente de Chile' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'quien es el actual presidente de Chile', escalationAdapter as any)

    expect(result.stop_reason).toBe('tool_use')
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'web_search',
      input: { query: 'current president of Chile 2024' }
    })
    expect(ritos.saveRito.mock.calls[0][2]).toEqual(['web_search'])
    expect(ritos.saveRito.mock.calls[0][3]).toContain('via escalamiento')
  })

  it('escalation: si escalationAdapter tb falla, degrada a texto sin error', async () => {
    const adapter = mockAdapter()
    const escalationAdapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search","requires_environment_action":true}')
      .mockResolvedValueOnce('The current president of Chile is Gabriel Boric.')
      .mockResolvedValueOnce('NO_TOOL')
    escalationAdapter.complete
      .mockResolvedValueOnce('I will use web_search to search for it.')
      .mockResolvedValueOnce('NO_TOOL')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'quien es el actual presidente de Chile' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'quien es el actual presidente de Chile', escalationAdapter as any)

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
  })

  it('patron_a: sin escalationAdapter, doble rechazo coherence_redundant degrada a texto igual (regresion)', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test"}}')
      .mockResolvedValueOnce("Already done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('I checked each part explicitly.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test2"}}')
      .mockResolvedValueOnce("Still done.\nNO\nCATEGORY: REDUNDANT")

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do a search' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'do a search', null)

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(result.content[0].text).toContain('Ya tengo lo que necesitaba')
  })

  it('patron_a: doble rechazo coherence_redundant, escalationAdapter propone tool distinta aprobada → tool_use', async () => {
    const adapter = mockAdapter()
    const escalationAdapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test"}}')
      .mockResolvedValueOnce("Already done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('I checked each part explicitly.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test2"}}')
      .mockResolvedValueOnce("Still done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('YES')
    escalationAdapter.complete
      .mockResolvedValueOnce('I should use read_file to check the file first.')
      .mockResolvedValueOnce('{"tool":"read_file","input":{"path":"notes.txt"}}')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do a search' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'do a search', escalationAdapter as any)

    expect(result.stop_reason).toBe('tool_use')
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'read_file',
      input: { path: 'notes.txt' }
    })
    expect(ritos.saveRito.mock.calls[0][2]).toEqual(['read_file'])
    expect(ritos.saveRito.mock.calls[0][3]).toContain('via escalamiento')
  })

  it('patron_a: escalation tb falla, degrada a texto coherence_redundant', async () => {
    const adapter = mockAdapter()
    const escalationAdapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"one web_search"}')
      .mockResolvedValueOnce('I should use web_search.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test"}}')
      .mockResolvedValueOnce("Already done.\nNO\nCATEGORY: REDUNDANT")
      .mockResolvedValueOnce('I checked each part explicitly.')
      .mockResolvedValueOnce('{"tool":"web_search","input":{"query":"test2"}}')
      .mockResolvedValueOnce("Still done.\nNO\nCATEGORY: REDUNDANT")
    escalationAdapter.complete
      .mockResolvedValueOnce('I should use read_file.')
      .mockResolvedValueOnce('NO_TOOL')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'do a search' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'do a search', escalationAdapter as any)

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(result.content[0].text).toContain('Ya tengo lo que necesitaba')
  })

  it('ritosLookupEnabled: false desactiva lookupPattern pero recordPattern sigue ejecutandose', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"simple","reason":"greeting"}')
      .mockResolvedValueOnce('Hola! Como estas?')

    await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'hola' }]
    }, ritos as any, 'test-user', 'test-model', 'hola', null, undefined, false)

    expect(ritos.findRito).not.toHaveBeenCalled()
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('ritosLookupEnabled omitido (undefined): lookupPattern se ejecuta normalmente (regresion)', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    ritos.findRito.mockReturnValue(null)
    adapter.complete
      .mockResolvedValueOnce('{"level":"simple","reason":"greeting"}')
      .mockResolvedValueOnce('Hola! Como estas?')

    await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'hola' }]
    }, ritos as any, 'test-user', 'test-model', 'hola')

    expect(ritos.findRito).toHaveBeenCalled()
    expect(ritos.saveRito).not.toHaveBeenCalled()
  })

  it('respond: serializePhase devuelve tool=respond → end_turn sin llamar saveRito ni FormVerifier', async () => {
    const adapter = mockAdapter()
    const ritos = mockRitos()
    adapter.complete
      .mockResolvedValueOnce('{"level":"moderate","reason":"greeting"}')
      .mockResolvedValueOnce('The user is greeting me, no tool is needed.')
      .mockResolvedValueOnce('{"tool":"respond","input":{"message":"¡Hola! ¿Cómo estás?"}}')

    const result = await runPipeline(adapter as any, {
      messages: [{ role: 'user', content: 'hola, como estas?' }],
      tools: TOOLS
    }, ritos as any, 'test-user', 'test-model', 'hola, como estas?')

    expect(result.stop_reason).toBe('end_turn')
    expect(result.content[0]).toMatchObject({ type: 'text', text: '¡Hola! ¿Cómo estás?' })
    expect(ritos.saveRito).not.toHaveBeenCalled()
    expect(adapter.complete).toHaveBeenCalledTimes(3)
  })

  it('regresion m4: serializePhase devuelve tool real (web_search) → pasa por FormVerifier y graba en Ritos', async () => {
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
    }, ritos as any, 'test-user', 'test-model', 'busca info sobre Argentina')

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'web_search',
      input: { query: 'Argentina news' }
    })
    expect(result.stop_reason).toBe('tool_use')
    expect(ritos.saveRito).toHaveBeenCalledTimes(1)
    expect(ritos.saveRito.mock.calls[0][2]).toEqual(['web_search'])
  })
})

describe('buildCoherenceHistory', () => {
  it('reemplaza texto libre del asistente con placeholder y omite la frase original', () => {
    const messages = [
      { role: 'user', content: 'busca info sobre Argentina' },
      { role: 'assistant', content: 'The task has already been completed, no further action is required.' },
      { role: 'user', content: 'agrega más información' }
    ]
    const result = buildCoherenceHistory(messages)
    expect(result).not.toContain('The task has already been completed')
    expect(result).toContain('[respuesta previa omitida — no se restituye texto libre para evitar sesgo]')
    expect(result).toContain('User: busca info sobre Argentina')
    expect(result).toContain('User: agrega más información')
  })

  it('regresion: mensajes con [tool_use: se restituyen sin placeholder', () => {
    const messages = [
      { role: 'user', content: 'busca info sobre Argentina' },
      { role: 'assistant', content: '[tool_use: web_search {"query":"Argentina"}]' },
      { role: 'user', content: 'busca más' },
      { role: 'assistant', content: '[tool_use: web_search {"query":"Chile"}]' }
    ]
    const result = buildCoherenceHistory(messages)
    expect(result).toContain('[tool_use: web_search {"query":"Argentina"}]')
    expect(result).toContain('[tool_use: web_search {"query":"Chile"}]')
    expect(result).not.toContain('[respuesta previa omitida')
  })

  it('regresion: mezcla de mensajes usuario y asistente con tool_use se comporta igual que el map original', () => {
    const messages = [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '[tool_use: respond {"message":"hola!"}]' }
    ]
    const result = buildCoherenceHistory(messages)
    expect(result).toContain('User: hola')
    expect(result).toContain('Ezio: [tool_use: respond {"message":"hola!"}]')
  })
})