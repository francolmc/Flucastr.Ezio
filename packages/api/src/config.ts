import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface ApiConfig {
  port: number
  userId?: string
  model: {
    provider: 'ollama' | 'anthropic' | 'openai' | 'google'
    name: string
    baseUrl?: string
    apiKey?: string
  }
}

const DEFAULTS: ApiConfig = {
  port: 4141,
  model: {
    provider: 'ollama',
    name: 'qwen3:4b',
    baseUrl: 'http://localhost:11434'
  }
}

function getConfigPath(): string {
  return path.join(os.homedir(), '.ezio', 'api-config.json')
}

export function loadApiConfig(): ApiConfig {
  const filePath = getConfigPath()

  if (!fs.existsSync(filePath)) {
    return DEFAULTS
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    console.warn(`[loadApiConfig] No se pudo leer ${filePath}, usando defaults`)
    return DEFAULTS
  }

  let parsed: Partial<ApiConfig>
  try {
    parsed = JSON.parse(content)
  } catch {
    console.warn(`[loadApiConfig] JSON inválido en ${filePath}, usando defaults`)
    return DEFAULTS
  }

  const config: ApiConfig = {
    port: parsed.port ?? DEFAULTS.port,
    model: {
      provider: parsed.model?.provider ?? DEFAULTS.model.provider,
      name: parsed.model?.name ?? DEFAULTS.model.name,
      baseUrl: parsed.model?.baseUrl ?? DEFAULTS.model.baseUrl,
      apiKey: parsed.model?.apiKey
    }
  }

  if (config.model.provider === 'ollama') {
    if (!config.model.baseUrl) {
      throw new Error(
        `Provider 'ollama' requiere 'model.baseUrl' en ${filePath} (ej: "http://localhost:11434")`
      )
    }
  } else {
    if (!config.model.apiKey) {
      throw new Error(
        `Provider '${config.model.provider}' (cloud) requiere 'model.apiKey' en ${filePath}`
      )
    }
  }

  return config
}
