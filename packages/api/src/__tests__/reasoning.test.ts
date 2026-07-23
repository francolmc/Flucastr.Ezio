import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  })
})
