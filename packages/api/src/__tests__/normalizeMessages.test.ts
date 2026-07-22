import { describe, it, expect } from 'vitest'
import { normalizeContent, normalizeMessages, normalizeSystem } from '../normalizeMessages.js'
import type { RawIncomingMessage } from '../normalizeMessages.js'

describe('normalizeContent', () => {
  it('devuelve string tal cual si content es string', () => {
    expect(normalizeContent('hola mundo')).toBe('hola mundo')
  })

  it('concatena texto de bloques tipo text con \\n si hay más de uno', () => {
    const content = [
      { type: 'text', text: 'primera línea' },
      { type: 'text', text: 'segunda línea' }
    ]
    expect(normalizeContent(content)).toBe('primera línea\nsegunda línea')
  })

  it('maneja array con un solo bloque texto', () => {
    const content = [{ type: 'text', text: 'hola' }]
    expect(normalizeContent(content)).toBe('hola')
  })

  it('representa tool_use como texto plano legible', () => {
    const content = [
      { type: 'tool_use', name: 'web_search', input: { query: 'test' } }
    ]
    expect(normalizeContent(content)).toBe('[tool_use: web_search {"query":"test"}]')
  })

  it('representa tool_result como texto plano legible', () => {
    const content = [
      { type: 'tool_result', content: 'resultado de la búsqueda' }
    ]
    expect(normalizeContent(content)).toBe('[tool_result: resultado de la búsqueda]')
  })

  it('concatena bloques mezclados text y tool sin perder información', () => {
    const content = [
      { type: 'text', text: 'busqué en la web' },
      { type: 'tool_result', content: 'encontré: hace calor hoy' },
      { type: 'text', text: 'respondido' }
    ]
    expect(normalizeContent(content)).toBe('busqué en la web\n[tool_result: encontré: hace calor hoy]\nrespondido')
  })

  it('devuelve string vacío para undefined', () => {
    expect(normalizeContent(undefined)).toBe('')
  })

  it('devuelve string vacío para null', () => {
    expect(normalizeContent(null)).toBe('')
  })

  it('devuelve string vacío para array vacío', () => {
    expect(normalizeContent([])).toBe('')
  })
})

describe('normalizeMessages', () => {
  it('preserva el role y normaliza content string', () => {
    const messages: RawIncomingMessage[] = [
      { role: 'user', content: 'hola' }
    ]
    const result = normalizeMessages(messages)
    expect(result).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('normaliza content array de bloques a string', () => {
    const messages: RawIncomingMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'hola' }] }
    ]
    const result = normalizeMessages(messages)
    expect(result).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('reproduce el caso real OpenCode: content array con texto', () => {
    const messages: RawIncomingMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'hola' }] }
    ]
    const result = normalizeMessages(messages)
    expect(result[0].content).toBe('hola')
    expect(typeof result[0].content).toBe('string')
  })

  it('preserva roles assistant y system', () => {
    const messages: RawIncomingMessage[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'assistant', content: '¿cómo puedo ayudarte?' },
      { role: 'user', content: [{ type: 'text', text: 'gracias' }] }
    ]
    const result = normalizeMessages(messages)
    expect(result[0].role).toBe('system')
    expect(result[1].role).toBe('assistant')
    expect(result[2].role).toBe('user')
  })

  it('devuelve array vacío si input no es array', () => {
    expect(normalizeMessages(null as any)).toEqual([])
    expect(normalizeMessages(undefined as any)).toEqual([])
  })
})

describe('normalizeSystem', () => {
  it('devuelve string tal cual si system es string', () => {
    expect(normalizeSystem('You are a helpful assistant.')).toBe('You are a helpful assistant.')
  })

  it('normaliza array de bloques texto a string concatenado', () => {
    const system = [
      { type: 'text', text: 'Eres un asistente muy útil.' },
      { type: 'text', text: 'Siempre respondes con precisión.' }
    ]
    expect(normalizeSystem(system)).toBe('Eres un asistente muy útil.\nSiempre respondes con precisión.')
  })

  it('maneja array con un solo bloque texto', () => {
    const system = [{ type: 'text', text: 'You are a helpful assistant.' }]
    expect(normalizeSystem(system)).toBe('You are a helpful assistant.')
  })

  it('devuelve undefined para undefined (pipeline.ts aplica fallback)', () => {
    expect(normalizeSystem(undefined)).toBe(undefined)
  })

  it('devuelve undefined para array vacío (trata como "no system")', () => {
    expect(normalizeSystem([])).toBe(undefined)
  })

  it('reproduce el caso real OpenCode: system como array de bloques texto', () => {
    const system = [{ type: 'text', text: 'You are a helpful assistant.' }]
    const result = normalizeSystem(system)
    expect(result).toBe('You are a helpful assistant.')
    expect(typeof result).toBe('string')
  })
})
