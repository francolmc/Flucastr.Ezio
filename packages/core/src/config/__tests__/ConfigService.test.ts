import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ConfigService } from '../ConfigService'
import { OllamaAdapter } from '../../adapters/OllamaAdapter'
import { AnthropicAdapter } from '../../adapters/AnthropicAdapter'
import { GoogleAdapter } from '../../adapters/GoogleAdapter'

describe('ConfigService', () => {
  const tempDir = path.join(os.tmpdir(), `ezio-test-${Date.now()}`)

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('load()', () => {
    it('load() with file not found throws Error with instructions', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.json')

      expect(() => ConfigService.load(nonExistentPath)).toThrow(
        /Config file not found at.*nonexistent\.json/
      )
      expect(() => ConfigService.load(nonExistentPath)).toThrow(
        /Please create it with the following structure/
      )
    })

    it('load() with valid file returns parsed object', () => {
      const configPath = path.join(tempDir, 'config.json')
      const config = {
        model: { provider: 'ollama', name: 'qwen3:4b' },
        providers: { ollama: { baseUrl: 'http://192.168.1.202:11434' } }
      }
      fs.writeFileSync(configPath, JSON.stringify(config))

      const result = ConfigService.load(configPath)

      expect(result).toEqual(config)
      expect(result.model.provider).toBe('ollama')
      expect(result.model.name).toBe('qwen3:4b')
    })
  })

  describe('getActiveAdapter()', () => {
    it('getActiveAdapter() with ollama provider returns OllamaAdapter instance', () => {
      const config = {
        model: { provider: 'ollama', name: 'qwen3:4b' },
        providers: { ollama: { baseUrl: 'http://192.168.1.202:11434' } }
      }

      const adapter = ConfigService.getActiveAdapter(config)

      expect(adapter).toBeInstanceOf(OllamaAdapter)
    })

    it('getActiveAdapter() with provider configured but missing section throws Error', () => {
      const config = {
        model: { provider: 'anthropic', name: 'claude-3-5-sonnet' },
        providers: {}
      }

      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        /Missing 'anthropic' config in providers/
      )
      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        /providers\.anthropic/
      )
    })

    it('getActiveAdapter() with invalid provider throws Error listing supported providers', () => {
      const config = {
        model: { provider: 'fake-provider', name: 'some-model' },
        providers: { 'fake-provider': { some: 'config' } }
      }

      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        /Unsupported provider 'fake-provider'/
      )
      expect(() => ConfigService.getActiveAdapter(config)).toThrow(
        /Supported providers: ollama, anthropic, google/
      )
    })
  })
})