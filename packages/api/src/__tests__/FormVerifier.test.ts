import { describe, it, expect, vi } from 'vitest'
import { FormVerifier } from '../FormVerifier.js'
import type { AnthropicToolSchema } from '../types.js'

const makeTool = (name: string, required: string[] = [], properties: Record<string, { type: string }> = {}): AnthropicToolSchema => ({
  name,
  description: '',
  input_schema: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      count: { type: 'number' },
      active: { type: 'boolean' },
      ...properties
    },
    required
  }
})

const TOOLS: AnthropicToolSchema[] = [
  makeTool('sendMessage', ['message']),
  makeTool('setStatus', ['active'], { active: { type: 'boolean' } }),
  makeTool('notify', ['message', 'count'], { message: { type: 'string' }, count: { type: 'number' } }),
  makeTool('runCommand', ['command', 'timeout'], {
    command: { type: 'string' },
    timeout: { type: 'integer' }
  })
]

const mockAdapter = () => ({
  complete: vi.fn().mockResolvedValue('ANSWER: YES')
})

describe('FormVerifier', () => {
  describe('checkSchema', () => {
    it('rechaza tool con nombre inexistente', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema({ name: 'unknown', input: {} }, TOOLS)
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(false)
      expect(result.reason).toContain('unknown')
    })

    it('rechaza falta campo requerido', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema({ name: 'sendMessage', input: {} }, TOOLS)
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(false)
      expect(result.reason).toContain('falta campo requerido')
    })

    it('rechaza tipo incorrecto', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema(
        { name: 'notify', input: { message: 'hi', count: 'not-a-number' } },
        TOOLS
      )
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(false)
      expect(result.reason).toContain('tipo incorrecto')
    })

    it('aprueba propuesta válida de schema', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema(
        { name: 'sendMessage', input: { message: 'hello' } },
        TOOLS
      )
      expect(result.approved).toBe(true)
      expect(result.costLLM).toBe(false)
    })

    it('aprueba valor entero contra schema integer', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema(
        { name: 'runCommand', input: { command: 'ls', timeout: 30000 } },
        TOOLS
      )
      expect(result.approved).toBe(true)
      expect(result.costLLM).toBe(false)
    })

    it('rechaza valor float contra schema integer', () => {
      const verifier = new FormVerifier(mockAdapter())
      const result = verifier.checkSchema(
        { name: 'runCommand', input: { command: 'ls', timeout: 30.5 } },
        TOOLS
      )
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(false)
      expect(result.reason).toContain('tipo incorrecto')
      expect(result.reason).toContain('se espera integer')
    })
  })

  describe('checkCoherence', () => {
    it('rechaza cuando el modelo responde NO', async () => {
      const adapter = mockAdapter()
      adapter.complete = vi.fn().mockResolvedValue('ANSWER: NO')
      const verifier = new FormVerifier(adapter)
      const result = await verifier.checkCoherence({ name: 'sendMessage', input: { message: 'hi' } }, 'envia un mensaje')
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(true)
    })

    it('aprueba cuando el modelo responde YES', async () => {
      const adapter = mockAdapter()
      adapter.complete = vi.fn().mockResolvedValue('ANSWER: YES')
      const verifier = new FormVerifier(adapter)
      const result = await verifier.checkCoherence({ name: 'sendMessage', input: { message: 'hi' } }, 'envia un mensaje')
      expect(result.approved).toBe(true)
      expect(result.costLLM).toBe(true)
    })

    it('rechaza respuesta ambigua (fail-closed)', async () => {
      const adapter = mockAdapter()
      adapter.complete = vi.fn().mockResolvedValue('maybe?')
      const verifier = new FormVerifier(adapter)
      const result = await verifier.checkCoherence({ name: 'sendMessage', input: { message: 'hi' } }, 'envia un mensaje')
      expect(result.approved).toBe(false)
      expect(result.costLLM).toBe(true)
      expect(result.reason).toContain('ambigua')
    })
  })

  describe('verify', () => {
    it('nunca llama a LLM si checkSchema falla', async () => {
      const adapter = mockAdapter()
      const verifier = new FormVerifier(adapter)
      await verifier.verify({ name: 'unknown', input: {} }, TOOLS, 'dummy')
      expect(adapter.complete).not.toHaveBeenCalled()
    })

    it('propuesta válida completa → aprobado', async () => {
      const adapter = mockAdapter()
      adapter.complete = vi.fn().mockResolvedValue('ANSWER: YES')
      const verifier = new FormVerifier(adapter)
      const result = await verifier.verify(
        { name: 'sendMessage', input: { message: 'hello' } },
        TOOLS,
        'envia un mensaje'
      )
      expect(result.approved).toBe(true)
      expect(result.costLLM).toBe(true)
      expect(adapter.complete).toHaveBeenCalledOnce()
    })
  })
})
