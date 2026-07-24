import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args)
}))

import { loadApiConfig } from '../config.js'

describe('loadApiConfig', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
    mockReadFileSync.mockReset()
  })

  it('sin archivo en disco retorna DEFAULTS', () => {
    mockExistsSync.mockReturnValue(false)
    const config = loadApiConfig()
    expect(config.port).toBe(4141)
    expect(config.model.provider).toBe('ollama')
    expect(config.model.name).toBe('qwen3:4b')
    expect(config.model.baseUrl).toBe('http://localhost:11434')
  })

  it('JSON corrupto retorna DEFAULTS', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{ invalid json }' as any)
    const config = loadApiConfig()
    expect(config.port).toBe(4141)
    expect(config.model.provider).toBe('ollama')
  })

  it("provider 'ollama' sin baseUrl retorna config con baseUrl default", () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'ollama', name: 'llama2' }
    }) as any)
    const config = loadApiConfig()
    expect(config.model.provider).toBe('ollama')
    expect(config.model.baseUrl).toBe('http://localhost:11434')
  })

  it("provider cloud sin apiKey lanza Error", () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'anthropic', name: 'claude-3-5-sonnet' }
    }) as any)
    expect(() => loadApiConfig()).toThrow(/apiKey/)
  })

  it('config parcial hace merge correcto con DEFAULTS', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      port: 3000,
      model: { name: 'custom-model' }
    }) as any)
    const config = loadApiConfig()
    expect(config.port).toBe(3000)
    expect(config.model.name).toBe('custom-model')
    expect(config.model.provider).toBe('ollama')
    expect(config.model.baseUrl).toBe('http://localhost:11434')
  })

  it('sin escalationModel en JSON, config.escalationModel es undefined', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'ollama', name: 'llama2' }
    }) as any)
    const config = loadApiConfig()
    expect(config.escalationModel).toBeUndefined()
  })

  it('con escalationModel presente, se parsea correctamente', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'ollama', name: 'llama2' },
      escalationModel: {
        provider: 'ollama',
        name: 'qwen2.5:3b',
        baseUrl: 'http://localhost:11434',
        numGpu: 0
      }
    }) as any)
    const config = loadApiConfig()
    expect(config.escalationModel).toEqual({
      provider: 'ollama',
      name: 'qwen2.5:3b',
      baseUrl: 'http://localhost:11434',
      apiKey: undefined,
      numGpu: 0
    })
  })

  it('sin ritosLookupEnabled en JSON, config.ritosLookupEnabled es undefined', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'ollama', name: 'llama2' }
    }) as any)
    const config = loadApiConfig()
    expect(config.ritosLookupEnabled).toBeUndefined()
  })

  it('con ritosLookupEnabled: false, config.ritosLookupEnabled es false', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      model: { provider: 'ollama', name: 'llama2' },
      ritosLookupEnabled: false
    }) as any)
    const config = loadApiConfig()
    expect(config.ritosLookupEnabled).toBe(false)
  })
})
