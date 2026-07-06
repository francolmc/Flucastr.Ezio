#!/usr/bin/env node

import * as readline from 'node:readline'
import { EzioClient } from '@ezio/sdk'
import { ConfigService } from '@ezio/core'

const INPUT_PROMPT = '> '
const RESPONSE_PREFIX = 'ezio: '
const DEBUG = process.env.EZIO_DEBUG === 'true'

async function main() {
  let config
  try {
    config = ConfigService.load()
  } catch (error) {
    console.error(`Error loading config: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  const adapter = ConfigService.getActiveAdapter(config)
  const client = new EzioClient({ adapter })

  const { provider, name } = config.model
  console.log('╭─ Ezio ──────────────────────────╮')
  console.log(`│  model: ${name} · ${provider}       │`)
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
