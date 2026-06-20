import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import { ConfigService } from './ConfigService.js'

vi.mock('fs')
vi.mock('os')

describe('ConfigService', () => {
  const mockHomedir = '/home/user'
  const mockConfigPath = `${mockHomedir}/.ezio/config.json`

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(os, 'homedir').mockReturnValue(mockHomedir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('load', () => {
    it('throws error when config file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)

      expect(() => ConfigService.load()).toThrow(`Config file not found at ${mockConfigPath}`)
    })

    it('throws error when config is missing required fields', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{}')

      expect(() => ConfigService.load()).toThrow('missing required fields')
    })

    it('loads valid config successfully', () => {
      const validConfig = {
        model: { provider: 'ollama', name: 'qwen3:4b' },
        providers: { ollama: { baseUrl: 'http://localhost:11434' } }
      }
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(validConfig))

      const config = ConfigService.load()
      expect(config.model.provider).toBe('ollama')
      expect(config.model.name).toBe('qwen3:4b')
    })
  })

  describe('getActiveAdapter', () => {
    it('throws error when provider config is missing', () => {
      const config = {
        model: { provider: 'ollama' as const, name: 'qwen3:4b' },
        providers: {}
      }

      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        "Missing 'ollama' config in providers"
      )
    })

    it('throws error for invalid provider', () => {
      const config = {
        model: { provider: 'invalid' as any, name: 'model' },
        providers: {}
      }

      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        'Invalid provider "invalid"'
      )
    })

    it('returns OllamaAdapter for ollama provider', () => {
      const config = {
        model: { provider: 'ollama' as const, name: 'qwen3:4b' },
        providers: { ollama: { baseUrl: 'http://localhost:11434' } }
      }

      const adapter = ConfigService.getActiveAdapter(config)
      expect(adapter).toBeDefined()
    })

    it('returns AnthropicAdapter for anthropic provider', () => {
      const config = {
        model: { provider: 'anthropic' as const, name: 'claude-3-sonnet' },
        providers: { anthropic: { apiKey: 'sk-ant-test' } }
      }

      const adapter = ConfigService.getActiveAdapter(config)
      expect(adapter).toBeDefined()
    })

    it('returns GoogleAdapter for google provider', () => {
      const config = {
        model: { provider: 'google' as const, name: 'gemini-pro' },
        providers: { google: { apiKey: 'test-key' } }
      }

      const adapter = ConfigService.getActiveAdapter(config)
      expect(adapter).toBeDefined()
    })
  })
})
