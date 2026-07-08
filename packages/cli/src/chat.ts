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
  const userId = config.userId ?? 'local'

  const baseExecutor = toolsProvider.createToolExecutor(adapter, targetLanguage)

  const safeExecutor = async (
    name: string,
    input: Record<string, unknown>
  ): Promise<string> => {
    const destructive = ['move_file', 'delete_file']
    if (destructive.includes(name)) {
      const preview = name === 'move_file'
        ? `Move: ${input.source} → ${input.destination}`
        : `Delete: ${input.path}`

      process.stdout.write(`\n⚠  ${preview}\n   Confirm? (y/n): `)

      const answer = await new Promise<string>(resolve => {
        const handler = (data: Buffer) => {
          process.stdin.removeListener('data', handler)
          resolve(data.toString().trim().toLowerCase())
        }
        process.stdin.once('data', handler)
      })

      if (answer !== 'y' && answer !== 'yes') {
        return `Operation cancelled by user: ${preview}`
      }
    }
    return baseExecutor(name, input)
  }

  const client = new EzioClient({
    adapter,
    tools,
    toolExecutor: safeExecutor,
    db,
    userId,
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

    if (trimmed === '/facts') {
      const facts = client.getFacts()
      if (facts.length === 0) {
        console.log('No facts stored yet.')
      } else {
        facts.forEach(f => console.log(`  ${f.key}: ${f.value}`))
      }
      continue
    }

    if (trimmed === '/help') {
      console.log('/clear    - clear conversation history')
      console.log('/context  - show current context size')
      console.log('/facts    - show what Ezio remembers about you')
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

        const ws = result.workingStateData
        if (ws) {
          for (const [key, files] of Object.entries(ws.trackedFiles)) {
            if (files.length === 0) continue
            const label = key.split(':')[1] ?? key
            console.log(`\n📁 Archivos [${label}] — ${files.length} en total:`)
            files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`))
          }

          if (ws.createdDirectories.length > 0) {
            console.log(`\n✓ Carpetas creadas:`)
            ws.createdDirectories.forEach(d => console.log(`   ${d}`))
          }

          if (ws.movedFiles.length > 0) {
            console.log(`\n✓ Archivos movidos:`)
            ws.movedFiles.forEach(f => console.log(`   ${f}`))
          }

          if (ws.writtenFiles.length > 0) {
            console.log(`\n✓ Archivos escritos:`)
            ws.writtenFiles.forEach(f => console.log(`   ${f}`))
          }
        }

        if (DEBUG) {
          const steps = result.stepResults
          const stepStatuses = steps.map((s, i) => `step${i + 1}=${s.status}`).join(' ')
          console.log(`[debug] classification=${result.classification} steps=${steps.length} ${stepStatuses}`)
        }

        console.log('')
    } catch (error) {
      process.stdout.write('\r' + ' '.repeat(4) + '\r')
      console.error(`${RESPONSE_PREFIX}Error: ${error instanceof Error ? error.message : error}`)
    }
  }

  cleanup()
}

main()
