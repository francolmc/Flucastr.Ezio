import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { ModelAdapter } from '../adapters/ModelAdapter.js'
import { OllamaAdapter } from '../adapters/OllamaAdapter.js'
import { AnthropicAdapter } from '../adapters/AnthropicAdapter.js'
import { GoogleAdapter } from '../adapters/GoogleAdapter.js'

export interface OllamaProviderConfig {
  baseUrl: string
}

export interface AnthropicProviderConfig {
  apiKey: string
}

export interface GoogleProviderConfig {
  apiKey: string
}

export interface EzioConfig {
  model: {
    provider: 'ollama' | 'anthropic' | 'google'
    name: string
  }
  providers: {
    ollama?: OllamaProviderConfig
    anthropic?: AnthropicProviderConfig
    google?: GoogleProviderConfig
  }
}

export class ConfigService {
  static load(): EzioConfig {
    const configPath = path.join(os.homedir(), '.ezio', 'config.json')

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Config file not found at ${configPath}\n\n` +
        `Create ~/.ezio/config.json with the following structure:\n\n` +
        JSON.stringify(
          {
            model: { provider: 'ollama', name: 'qwen3:4b' },
            providers: {
              ollama: { baseUrl: 'http://192.168.1.202:11434' }
            }
          },
          null,
          2
        ) +
        '\n\nValid providers are: ollama, anthropic, google'
      )
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content) as EzioConfig

    if (!config.model?.provider || !config.model?.name) {
      throw new Error(
        `Invalid config: missing required fields "model.provider" and/or "model.name"\n` +
        `Expected: { model: { provider: "ollama"|"anthropic"|"google", name: "..." }, providers: { ... } }`
      )
    }

    return config
  }

  static getActiveAdapter(config?: EzioConfig): ModelAdapter {
    const activeConfig = config ?? ConfigService.load()
    const { provider, name } = activeConfig.model

    const validProviders = ['ollama', 'anthropic', 'google'] as const
    if (!validProviders.includes(provider)) {
      throw new Error(
        `Invalid provider "${provider}". Supported providers are: ${validProviders.join(', ')}`
      )
    }

    const providerConfig = activeConfig.providers[provider]

    if (!providerConfig) {
      const exampleKey = provider === 'ollama' ? 'baseUrl' : 'apiKey'
      throw new Error(
        `Missing '${provider}' config in providers. ` +
        `Add { "${exampleKey}": "..." } under providers.${provider} in ~/.ezio/config.json`
      )
    }

    switch (provider) {
      case 'ollama':
        return new OllamaAdapter({
          baseUrl: (providerConfig as OllamaProviderConfig).baseUrl,
          model: name
        })
      case 'anthropic':
        return new AnthropicAdapter({
          apiKey: (providerConfig as AnthropicProviderConfig).apiKey,
          model: name
        })
      case 'google':
        return new GoogleAdapter({
          apiKey: (providerConfig as GoogleProviderConfig).apiKey,
          model: name
        })
      default:
        throw new Error(
          `Invalid provider "${provider}". Supported providers are: ollama, anthropic, google`
        )
    }
  }
}
