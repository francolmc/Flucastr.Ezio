import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { MigrationRunner } from '../db/MigrationRunner'
import type { ModelAdapter } from '../adapters/ModelAdapter'
import { OllamaAdapter } from '../adapters/OllamaAdapter'
import { AnthropicAdapter } from '../adapters/AnthropicAdapter'
import { GoogleAdapter } from '../adapters/GoogleAdapter'
import { OpenAIAdapter } from '../adapters/OpenAIAdapter'

type ModelSize = 'small' | 'medium' | 'large'

interface ReasoningConfig {
  modelSize: ModelSize
  maxPlanSteps: number
  maxValidationIterations: number
  twoPhaseReasoning: boolean
  maxReactiveDecomposePerRun: number
  toolRetrievalThreshold: number
  maxWebSearchPerRun: number
}

export interface EzioConfig {
  model: { provider: 'ollama' | 'anthropic' | 'google'; name: string }
  providers: {
    ollama?: { baseUrl: string }
    anthropic?: { apiKey: string }
    google?: { apiKey: string }
  }
  reasoning?: Partial<ReasoningConfig>
  tools?: {
    tavilyApiKey?: string
  }
  mcpServers?: Array<{ name: string, url: string, enabled?: boolean }>
  provider?: 'ollama' | 'anthropic' | 'google' | 'openai'
  apiKey?: string
  baseUrl?: string
  userId?: string
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
    twoPhaseReasoning: true,
    maxReactiveDecomposePerRun: 1,
    toolRetrievalThreshold: 12,
    maxWebSearchPerRun: 5
  },
  tools: {
    tavilyApiKey: 'tvly-...'
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

  static createAdapter(config?: EzioConfig): ModelAdapter {
    let cfg: EzioConfig | undefined = config

    if (!cfg) {
      try {
        cfg = ConfigService.load()
      } catch {
        return new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'qwen3:4b' })
      }
    }

    const provider = cfg.provider ?? 'ollama'

    switch (provider) {
      case 'anthropic':
        if (!cfg.apiKey) throw new Error('Missing required field "apiKey" for anthropic provider')
        return new AnthropicAdapter({ apiKey: cfg.apiKey, model: cfg.model.name })
      case 'google':
        if (!cfg.apiKey) throw new Error('Missing required field "apiKey" for google provider')
        return new GoogleAdapter({ apiKey: cfg.apiKey, model: cfg.model.name })
      case 'openai':
        if (!cfg.apiKey) throw new Error('Missing required field "apiKey" for openai provider')
        return new OpenAIAdapter({ apiKey: cfg.apiKey, model: cfg.model.name })
      case 'ollama':
      default:
        return new OllamaAdapter({
          baseUrl: cfg.baseUrl ?? 'http://localhost:11434',
          model: cfg.model.name ?? 'qwen3:4b'
        })
    }
  }

  static createDb(dbPath?: string): DatabaseSync {
    const resolvedPath = dbPath
      ?? process.env.EZIO_DB_PATH
      ?? path.join(os.homedir(), '.ezio', 'ezio.db')

    const db = new DatabaseSync(resolvedPath)

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const migrationsDir = path.resolve(__dirname, 'db', 'migrations')

    const runner = new MigrationRunner(db)
    runner.run(migrationsDir)

    return db
  }
}