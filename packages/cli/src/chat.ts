#!/usr/bin/env node

import * as readline from 'node:readline'
import { EzioClient } from '@ezio/sdk'
import { ConfigService } from '@ezio/core'
import { createToolsProvider } from '@ezio/tools'

const INPUT_PROMPT = '> '
const RESPONSE_PREFIX = 'ezio: '
const DEBUG = process.env.EZIO_DEBUG === 'true'

async function main() {
  const systemLocale = process.env.LANG ?? process.env.LC_ALL ?? 'en'
  const systemLanguage = systemLocale.split('_')[0].toLowerCase()
  const targetLanguage = ['es', 'pt', 'fr', 'de', 'it'].includes(systemLanguage)
    ? systemLanguage
    : 'en'

  let config
  try {
    config = ConfigService.load()
  } catch (error) {
    console.error(`Error loading config: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  const toolsProvider = createToolsProvider({
    mcpServers: config.mcpServers ?? []
  })
  const tools = await toolsProvider.getTools()
  const adapter = ConfigService.getActiveAdapter(config)
  const db = ConfigService.createDb()
  const client = new EzioClient({
    adapter,
    tools,
    toolExecutor: toolsProvider.createToolExecutor(adapter, targetLanguage),
    db,
  })

  const { provider, name } = config.model
  const sessionId = client.getSessionId().slice(0, 8)
  console.log('╭─ Ezio ──────────────────────────╮')
  console.log(`│  model: ${name} · ${provider}       │`)
  console.log(`│  tools: ${tools.length} native                   │`)
  console.log(`│  session: ${sessionId}                 │`)
  console.log('│  type "exit" to quit            │')
  console.log('╰─────────────────────────────────╯')
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve))

  const cleanup = () => {
    console.log('\nGoodbye.')
    rl.close()
  }

  process.on('SIGINT', () => {
    cleanup()
    process.exit(0)
  })

  while (true) {
    const line = await question(INPUT_PROMPT)
    const trimmed = line.trim().toLowerCase()

    if (trimmed === 'exit' || trimmed === 'quit') {
      break
    }

    if (trimmed === '/clear') {
      client.clearHistory()
      console.log('history cleared')
      continue
    }

    if (trimmed === '/history') {
      const history = client.getHistory()
      const lastSix = history.slice(-6)
      for (const msg of lastSix) {
        const role = msg.role === 'user' ? 'user' : 'ezio'
        const content = msg.content.length > 50
          ? msg.content.slice(0, 47) + '...'
          : msg.content
        console.log(`[${role}] ${content}`)
      }
      continue
    }

    if (trimmed === '/model') {
      console.log(`${name} · ${provider}`)
      continue
    }

    if (trimmed === '/restart') {
      client.clearHistory()
      console.log('\nContext cleared.\n')
      console.log('╭─ Ezio ──────────────────────────╮')
      console.log(`│  model: ${name} · ${provider}       │`)
      console.log(`│  tools: ${tools.length} native                   │`)
      console.log(`│  session: ${sessionId}                 │`)
      console.log('│  type "exit" to quit            │')
      console.log('╰─────────────────────────────────╯')
      console.log()
      continue
    }

    if (trimmed === '/context') {
      const h = client.getHistory()
      console.log(`Context: ${h.length} messages`)
      continue
    }

    if (trimmed === '/session') {
      console.log(`Session ID: ${client.getSessionId()}`)
      continue
    }

    if (trimmed === '/help') {
      console.log('/clear    - clear conversation history')
      console.log('/context  - show current context size')
      console.log('/history  - show last 6 messages')
      console.log('/model    - show active model')
      console.log('/restart  - clear context and reset')
      console.log('/session  - show current session ID')
      console.log('/help     - show this help')
      console.log('exit/quit - exit Ezio')
      continue
    }

    if (trimmed === '') {
      continue
    }

    process.stdout.write('...')
    try {
      const result = await client.resolve(line)
      process.stdout.write('\r' + ' '.repeat(4) + '\r')
      console.log(`${RESPONSE_PREFIX}${result.response}`)

      if (DEBUG) {
        const steps = result.stepResults
        const stepStatuses = steps.map((s, i) => `step${i + 1}=${s.status}`).join(' ')
        console.log(`[debug] classification=${result.classification} steps=${steps.length} ${stepStatuses}`)
      }
    } catch (error) {
      process.stdout.write('\r' + ' '.repeat(4) + '\r')
      console.error(`${RESPONSE_PREFIX}Error: ${error instanceof Error ? error.message : error}`)
    }
  }

  cleanup()
}

main()
