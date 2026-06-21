import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { ModelAdapter } from '../adapters/ModelAdapter'
import { OllamaAdapter } from '../adapters/OllamaAdapter'
import { AnthropicAdapter } from '../adapters/AnthropicAdapter'
import { GoogleAdapter } from '../adapters/GoogleAdapter'

export interface EzioConfig {
  model: { provider: 'ollama' | 'anthropic' | 'google'; name: string }
  providers: {
    ollama?: { baseUrl: string }
    anthropic?: { apiKey: string }
    google?: { apiKey: string }
  }
}

const SUPPORTED_PROVIDERS = ['ollama', 'anthropic', 'google'] as const

const EXAMPLE_CONFIG = JSON.stringify({
  model: { provider: 'ollama', name: 'qwen3:4b' },
  providers: {
    ollama: { baseUrl: 'http://192.168.1.202:11434' },
    anthropic: { apiKey: 'sk-ant-...' },
    google: { apiKey: '...' }
  }
}, null, 2)

export class ConfigService {
  static load(configPath?: string): EzioConfig {
    const filePath = configPath ?? path.join(os.homedir(), '.ezio', 'config.json')

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Config file not found at ${filePath}\n\n` +
        `Please create it with the following structure:\n\n` +
        `${EXAMPLE_CONFIG}`
      )
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as EzioConfig
  }

  static getActiveAdapter(config?: EzioConfig): ModelAdapter {
    const cfg = config ?? ConfigService.load()

    const { provider, name } = cfg.model

    const providerConfig = cfg.providers[provider]

    if (!providerConfig) {
      let missingMessage = ''
      if (provider === 'ollama') {
        missingMessage = `Add { "baseUrl": "..." } under providers.ollama in ${config ? 'the provided config' : '~/.ezio/config.json'}`
      } else if (provider === 'anthropic') {
        missingMessage = `Add { "apiKey": "..." } under providers.anthropic in ${config ? 'the provided config' : '~/.ezio/config.json'}`
      } else if (provider === 'google') {
        missingMessage = `Add { "apiKey": "..." } under providers.google in ${config ? 'the provided config' : '~/.ezio/config.json'}`
      }

      throw new Error(
        `Missing '${provider}' config in providers. ${missingMessage}`
      )
    }

    if (provider === 'ollama') {
      return new OllamaAdapter({
        baseUrl: providerConfig.baseUrl,
        model: name
      })
    }

    if (provider === 'anthropic') {
      return new AnthropicAdapter({
        apiKey: providerConfig.apiKey,
        model: name
      })
    }

    if (provider === 'google') {
      return new GoogleAdapter({
        apiKey: providerConfig.apiKey,
        model: name
      })
    }

    throw new Error(
      `Unsupported provider '${provider}'. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    )
  }
}