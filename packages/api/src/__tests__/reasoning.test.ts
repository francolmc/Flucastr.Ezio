import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ModelAdapter } from '@ezio/core'
import { serializePhase, reasonPhase } from '../reasoning.js'
import type { AnthropicToolSchema } from '../types.js'

const mockAdapter: ModelAdapter = {
  complete: vi.fn()
}

const mockTools: AnthropicToolSchema[] = [
  {
    name: 'bash',
    description: 'Run a bash command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' }
      },
      required: ['command']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  }
]

describe('reasoning (via serializePhase)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseJson via serializePhase', () => {
    it('JSON válido retorna {tool, input}', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('{"tool":"bash","input":{"command":"ls"}}')
      const result = await serializePhase(mockAdapter, 'reasoning text', mockTools)
      expect(result).toEqual({ tool: 'bash', input: { command: 'ls' } })
    })

    it('JSON envuelto en fences ```json retorna {tool, input}', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('```json\n{"tool":"bash","input":{"command":"ls"}}\n```')
      const result = await serializePhase(mockAdapter, 'reasoning text', mockTools)
      expect(result).toEqual({ tool: 'bash', input: { command: 'ls' } })
    })

    it('JSON con array malformado que dispara reparación de comillas retorna {tool, input}', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('{"tool":"bash","input":{"command":["ls","-la"]}}')
      const result = await serializePhase(mockAdapter, 'reasoning text', mockTools)
      expect(result).toEqual({ tool: 'bash', input: { command: ['ls', '-la'] } })
    })

    it('texto sin JSON parseable retorna null', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const result = await serializePhase(mockAdapter, 'reasoning text', mockTools)
      expect(result).toBeNull()
    })
  })

  describe('suggestsToolCall via serializePhase behavior', () => {
    it('tool name en el texto sugiere tool call', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await serializePhase(mockAdapter, 'I will use the bash tool', mockTools)
      expect(mockAdapter.complete).toHaveBeenCalled()
    })

    it('keyword de acción sugiere tool call', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await serializePhase(mockAdapter, 'I need to search for something', mockTools)
      expect(mockAdapter.complete).toHaveBeenCalled()
    })

    it('texto neutro no sugiere tool call', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await serializePhase(mockAdapter, 'Hello world', mockTools)
      expect(mockAdapter.complete).toHaveBeenCalled()
    })
  })

  describe('serializePhase', () => {
    it('respuesta "NO_TOOL" retorna null', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const result = await serializePhase(mockAdapter, 'no tool needed', mockTools)
      expect(result).toBeNull()
    })

    it('respuesta JSON válida retorna {tool, input}', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('{"tool":"web_search","input":{"query":"test"}}')
      const result = await serializePhase(mockAdapter, 'search for test', mockTools)
      expect(result).toEqual({ tool: 'web_search', input: { query: 'test' } })
    })

    it('llama adapter.complete con think: false', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await serializePhase(mockAdapter, 'reasoning text', mockTools)
      const call = mockAdapter.complete.mock.calls[0]
      expect(call[1]).toEqual(expect.objectContaining({ think: false }))
    })
  })

  describe('reasonPhase', () => {
    afterEach(() => {
      delete process.env.EZIO_DISABLE_ANTISC
      delete process.env.EZIO_DISABLE_LITERALFIDELITY
      delete process.env.EZIO_DISABLE_CONTENTTRANSFORM
    })

    it('el prompt enviado al adapter incluye descripción de tools y historial', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user' as const, content: 'list files' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools)
      expect(mockAdapter.complete).toHaveBeenCalled()
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Available tools:')
      expect(prompt).toContain('bash')
      expect(prompt).toContain('web_search')
      expect(prompt).toContain('Previous conversation:')
      expect(prompt).toContain('user: list files')
    })

    it('pasa numCtx al adapter', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await reasonPhase(mockAdapter, 'You are helpful', [], mockTools, 4096)
      const call = mockAdapter.complete.mock.calls[0]
      expect(call[1]).toEqual(expect.objectContaining({ numCtx: 4096 }))
    })

    it('llama adapter.complete con think: false', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      await reasonPhase(mockAdapter, 'You are helpful', [], mockTools)
      const call = mockAdapter.complete.mock.calls[0]
      expect(call[1]).toEqual(expect.objectContaining({ think: false }))
    })

    it('con requiresEnvironmentAction=true, prompt contiene few-shot example y fuerza tool call', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user' as const, content: 'search for something' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, true)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Example of the WRONG way to respond')
      expect(prompt).toContain('Example of the CORRECT way to respond')
      expect(prompt).toContain('I will use the web_search tool')
    })

    it('con requiresEnvironmentAction=false, prompt contiene Only answer directly (comportamiento original)', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user' as const, content: 'hello' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Only answer directly, without a tool')
    })

    it('sin requiresEnvironmentAction (undefined), prompt contiene Only answer directly (comportamiento original)', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user' as const, content: 'hello' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Only answer directly, without a tool')
    })

    it('con historial que incluye conclusion previa del asistente, prompt contiene antiSelfConditioningNote (requiresEnvironmentAction=false)', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [
        { role: 'user', content: 'create a file' },
        { role: 'assistant', content: 'The task has already been completed, no further action is required.' },
        { role: 'user', content: 'add a description to the file' }
      ]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Important: if an earlier assistant turn in this conversation concluded that "no further action was needed"')
    })

    it('con historial que incluye conclusion previa del asistente, prompt contiene antiSelfConditioningNote (requiresEnvironmentAction=true)', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [
        { role: 'user', content: 'who is the president of Chile' },
        { role: 'assistant', content: 'The task has already been completed, no further action is required.' },
        { role: 'user', content: 'who is the president of Argentina' }
      ]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, true)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('Important: if an earlier assistant turn in this conversation concluded that "no further action was needed"')
    })

    it('con contentSignals.hasLiteralIdentifier=true, prompt contiene nota de identificador literal', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user', content: 'create combinado.py' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false, undefined, { hasLiteralIdentifier: true, needsContentTransform: false })
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('when the user\'s message specifies an exact name for a file, path, variable, or identifier')
    })

    it('con contentSignals.hasLiteralIdentifier=false, prompt NO contiene nota de identificador literal', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user', content: 'search for something' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, true, undefined, { hasLiteralIdentifier: false, needsContentTransform: false })
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).not.toContain('when the user\'s message specifies an exact name for a file, path, variable, or identifier')
    })

    it('con contentSignals.needsContentTransform=true, prompt contiene nota de transformación de contenido', async () => {
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user', content: 'increméntalo en 1' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false, undefined, { hasLiteralIdentifier: false, needsContentTransform: true })
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).toContain('RESULT of combining, concatenating, or computing')
    })

    it('con EZIO_DISABLE_ANTISC=true, prompt NO contiene anti-self-conditioning note', async () => {
      process.env.EZIO_DISABLE_ANTISC = 'true'
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [
        { role: 'user', content: 'create a file' },
        { role: 'assistant', content: 'The task has already been completed, no further action is required.' },
        { role: 'user', content: 'add a description to the file' }
      ]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false)
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).not.toContain('Important: if an earlier assistant turn in this conversation concluded that "no further action was needed"')
    })

    it('con EZIO_DISABLE_LITERALFIDELITY=true, prompt NO contiene nota de identificador literal aunque hasLiteralIdentifier sea true', async () => {
      process.env.EZIO_DISABLE_LITERALFIDELITY = 'true'
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user', content: 'create combinado.py' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false, undefined, { hasLiteralIdentifier: true, needsContentTransform: false })
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).not.toContain('when the user\'s message specifies an exact name for a file, path, variable, or identifier')
    })

    it('con EZIO_DISABLE_CONTENTTRANSFORM=true, prompt NO contiene nota de transformación aunque needsContentTransform sea true', async () => {
      process.env.EZIO_DISABLE_CONTENTTRANSFORM = 'true'
      vi.mocked(mockAdapter.complete).mockResolvedValue('NO_TOOL')
      const messages = [{ role: 'user', content: 'increméntalo en 1' }]
      await reasonPhase(mockAdapter, 'You are helpful', messages, mockTools, undefined, false, undefined, { hasLiteralIdentifier: false, needsContentTransform: true })
      const call = mockAdapter.complete.mock.calls[0]
      const prompt = call[0][0].content as string
      expect(prompt).not.toContain('RESULT of combining, concatenating, or computing')
    })
  })
})
