#!/usr/bin/env tsx

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createSandbox, cleanupSandbox, executeTool } from './sandbox.js'
import type { MessagesResponse } from '../src/pipeline.js'

const API_URL = process.env.EZIO_API_URL ?? 'http://localhost:4141/v1/messages'
const N_RUNS = 3

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

interface TextBlock {
  type: 'text'
  text: string
}

type ContentBlock = ToolUseBlock | ToolResultBlock | TextBlock

function validateResumen(sandboxDir: string): boolean {
  try {
    const content = fs.readFileSync(path.join(sandboxDir, 'resumen.txt'), 'utf-8')
    const hasApp = content.includes('app.log')
    const hasServer = content.includes('server.log')
    const hasDebug = content.includes('debug.log')
    return hasApp && hasServer && !hasDebug
  } catch {
    return false
  }
}

const FIDELITY_VARIANTS = [
  {
    id: 'A',
    desc: 'baseline: 3 tools, reasonText sin contenido literal',
    seedFiles: { 'app.log': 'INFO inicio\nERROR fallo conexion', 'debug.log': 'INFO todo ok', 'server.log': 'ERROR timeout' },
    userMessage: 'Busca la palabra ERROR en todos los archivos .log, y crea un archivo resumen.txt listando los nombres de los archivos que la contienen',
    tools: [
      { name: 'glob', description: 'Find files matching a pattern', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern to match' } }, required: ['pattern'] } },
      { name: 'grep', description: 'Search for a pattern in files', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Pattern to search for' } }, required: ['pattern'] } },
      { name: 'write', description: 'Write content to a file', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Path to write to' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } }
    ],
    validate: validateResumen
  },
  {
    id: 'E',
    desc: 'recencia: reasonText con tool mencionada al final (dos oraciones)',
    seedFiles: { 'app.log': 'INFO inicio\nERROR fallo conexion', 'debug.log': 'INFO todo ok', 'server.log': 'ERROR timeout' },
    userMessage: 'Para completar la tarea, primero necesito ver qué archivos .log contienen ERROR. Then la herramienta necesaria para el paso final es write.',
    tools: [
      { name: 'glob', description: 'Find files matching a pattern', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern to match' } }, required: ['pattern'] } },
      { name: 'grep', description: 'Search for a pattern in files', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Pattern to search for' } }, required: ['pattern'] } },
      { name: 'write', description: 'Write content to a file', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Path to write to' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } }
    ],
    validate: validateResumen
  },
  {
    id: 'F',
    desc: 'terminal en misma oración: write tool al final',
    seedFiles: { 'app.log': 'INFO inicio\nERROR fallo conexion', 'debug.log': 'INFO todo ok', 'server.log': 'ERROR timeout' },
    userMessage: 'I will create a resumen.txt file listing the names of the log files that contain the word "ERROR", using the write tool.',
    tools: [
      { name: 'glob', description: 'Find files matching a pattern', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern to match' } }, required: ['pattern'] } },
      { name: 'grep', description: 'Search for a pattern in files', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Pattern to search for' } }, required: ['pattern'] } },
      { name: 'write', description: 'Write content to a file', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Path to write to' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } }
    ],
    validate: validateResumen
  },
  {
    id: 'G',
    desc: 'schema único: solo write shown (narrowing)',
    seedFiles: { 'app.log': 'INFO inicio\nERROR fallo conexion', 'debug.log': 'INFO todo ok', 'server.log': 'ERROR timeout' },
    userMessage: 'I will create a resumen.txt file listing the names of the log files that contain the word "ERROR", using the write tool.',
    tools: [
      { name: 'write', description: 'Write content to a file', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Path to write to' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } }
    ],
    validate: validateResumen
  }
]

async function runVariant(variant: typeof FIDELITY_VARIANTS[0]): Promise<{ id: string; pass: boolean; runs: number }> {
  const runs: boolean[] = []

  for (let i = 0; i < N_RUNS; i++) {
    const sandboxDir = createSandbox()

    if (variant.seedFiles) {
      for (const [fileName, content] of Object.entries(variant.seedFiles)) {
        fs.writeFileSync(path.join(sandboxDir, fileName), content, 'utf-8')
      }
    }

    const messages: { role: string; content: string | ContentBlock[] }[] = []
    messages.push({ role: 'user', content: variant.userMessage })

    let toolCallsInThisTurn = 0
    let turnComplete = false

    try {
      while (!turnComplete && toolCallsInThisTurn < 4) {
        toolCallsInThisTurn++

        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'l3-eval',
            max_tokens: 300,
            messages: messages,
            tools: variant.tools
          })
        })

        if (!res.ok) break

        const data: MessagesResponse = await res.json()
        const content = data.content[0] as ContentBlock

        if (content.type === 'tool_use') {
          const toolUse = content as ToolUseBlock
          messages.push({ role: 'assistant', content: [toolUse] })

          const result = executeTool(sandboxDir, toolUse.name, toolUse.input as Record<string, unknown>)
          const toolResult: ToolResultBlock = { type: 'tool_result', tool_use_id: toolUse.id, content: result }
          messages.push({ role: 'user', content: [toolResult] })
        } else if (content.type === 'text') {
          turnComplete = true
        }
      }

      runs.push(variant.validate(sandboxDir))
    } finally {
      cleanupSandbox(sandboxDir)
    }
  }

  const passCount = runs.filter(r => r).length
  return { id: variant.id, pass: passCount === N_RUNS, runs: passCount }
}

async function main() {
  console.log(`Serialize Fidelity Regression Test`)
  console.log(`API: ${API_URL}`)
  console.log(`Runs per variant: ${N_RUNS}\n`)

  const results: { id: string; pass: boolean; runs: number }[] = []

  for (const variant of FIDELITY_VARIANTS) {
    process.stdout.write(`Running variant ${variant.id}... `)
    const result = await runVariant(variant)
    results.push(result)
    console.log(`${result.runs}/${N_RUNS} ${result.pass ? 'PASS' : 'FAIL'}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  for (const r of results) {
    console.log(`  ${r.id}: ${r.runs}/${N_RUNS} ${r.pass ? '✓' : '✗'} - ${FIDELITY_VARIANTS.find(v => v.id === r.id)?.desc}`)
  }

  const allPass = results.every(r => r.pass)
  console.log(`\nOverall: ${allPass ? '✓ ALL PASS' : '✗ SOME FAILED'}`)
  process.exit(allPass ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
