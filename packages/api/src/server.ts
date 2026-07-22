import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadApiConfig } from './config.js'
import { OllamaAdapter, AnthropicAdapter, OpenAIAdapter, GoogleAdapter, ConfigService, createRitosService } from '@ezio/core'
import type { ModelAdapter, RitosService } from '@ezio/core'
import { runPipeline } from './pipeline.js'
import type { MessagesRequest } from './pipeline.js'
import { normalizeMessages, normalizeSystem } from './normalizeMessages.js'
import type { RawIncomingMessage } from './normalizeMessages.js'
import { sendSSEResponse } from './sseResponse.js'

const config = loadApiConfig()
const db = ConfigService.createDb(path.join(os.homedir(), '.ezio', 'api-ritos.db'))
const ritos = createRitosService(db)
const userId = config.userId ?? 'default-api-user'

function buildAdapter(): ModelAdapter {
  const { provider, name, baseUrl, apiKey } = config.model

  switch (provider) {
    case 'ollama':
      return new OllamaAdapter({ baseUrl: baseUrl!, model: name })
    case 'anthropic':
      return new AnthropicAdapter({ apiKey: apiKey!, model: name })
    case 'openai':
      return new OpenAIAdapter({ apiKey: apiKey!, model: name })
    case 'google':
      return new GoogleAdapter({ apiKey: apiKey!, model: name })
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      let request: MessagesRequest
      try {
        request = JSON.parse(body)
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' })
      }

      if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
        return sendJson(res, 400, { error: 'messages es requerido' })
      }

      const normalizedMessages = normalizeMessages(request.messages as RawIncomingMessage[])
      const normalizedRequest: MessagesRequest = {
        ...request,
        messages: normalizedMessages,
        system: normalizeSystem(request.system)
      }

      try {
        const adapter = buildAdapter()
        const response = await runPipeline(adapter, normalizedRequest, ritos, userId, config.model.name)
        if (request.stream) {
          return sendSSEResponse(res, response)
        }
        return sendJson(res, 200, response)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        if (message.includes('Verification rejected')) {
          return sendJson(res, 422, { error: message })
        }
        console.error('[server] unexpected error:', err)
        return sendJson(res, 500, { error: 'internal error' })
      }
    })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  }
})

server.listen(config.port, () => {
  console.log(`@ezio/api listening on port ${config.port}`)
})
