import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ModelAdapter } from '../adapters/ModelAdapter'
import { OllamaAdapter } from '../adapters/OllamaAdapter'
import { AnthropicAdapter } from '../adapters/AnthropicAdapter'
import { GoogleAdapter } from '../adapters/GoogleAdapter'
import type { ModelSize } from '../reasoning/types'

export interface ReasoningConfig {
  modelSize: ModelSize
  maxPlanSteps: number
  maxValidationIterations: number
  twoPhaseReasoning: boolean
}

export interface EzioConfig {
  model: { provider: 'ollama' | 'anthropic' | 'google'; name: string }
  providers: {
    ollama?: { baseUrl: string }
    anthropic?: { apiKey: string }
    google?: { apiKey: string }
  }
  reasoning?: Partial<ReasoningConfig>
}

const SUPPORTED_PROVIDERS = ['ollama', 'anthropic', 'google'] as const

const EXAMPLE_CONFIG = JSON.stringify({
  model: { provider: 'ollama', name: 'model-name' },
  providers: {
    ollama: { baseUrl: 'http://localhost:11434' },
    anthropic: { apiKey: 'sk-ant-...' },
    google: { apiKey: '...' }
  },
  reasoning: {
    modelSize: 'medium',
    maxPlanSteps: 5,
    maxValidationIterations: 3,
    twoPhaseReasoning: true
  }
}, null, 2)

const PROVIDER_MISSING_HINTS: Record<string, string> = {
  ollama: '"baseUrl"',
  anthropic: '"apiKey"',
  google: '"apiKey"'
}

type ProviderConfig = EzioConfig['providers'][keyof EzioConfig['providers']]

function createAdapter(
  provider: 'ollama',
  config: { baseUrl: string },
  name: string
): OllamaAdapter
function createAdapter(
  provider: 'anthropic',
  config: { apiKey: string },
  name: string
): AnthropicAdapter
function createAdapter(
  provider: 'google',
  config: { apiKey: string },
  name: string
): GoogleAdapter
function createAdapter(
  provider: string,
  config: ProviderConfig,
  name: string
): ModelAdapter {
  switch (provider) {
    case 'ollama':
      return new OllamaAdapter({ baseUrl: (config as { baseUrl: string }).baseUrl, model: name })
    case 'anthropic':
      return new AnthropicAdapter({ apiKey: (config as { apiKey: string }).apiKey, model: name })
    case 'google':
      return new GoogleAdapter({ apiKey: (config as { apiKey: string }).apiKey, model: name })
    default:
      throw new Error(
        `Unsupported provider '${provider}'. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
      )
  }
}

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
      const hint = PROVIDER_MISSING_HINTS[provider] ?? 'config'
      const location = config ? 'the provided config' : '~/.ezio/config.json'
      throw new Error(
        `Missing '${provider}' config in providers. Add { ${hint}: "..." } under providers.${provider} in ${location}`
      )
    }

    return createAdapter(provider, providerConfig, name)
  }
}