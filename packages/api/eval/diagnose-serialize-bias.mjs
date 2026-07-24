#!/usr/bin/env node
// Diagnóstico aislado del bug de c5: serializePhase ignora reasonText y
// serializa una tool distinta a la mencionada, y/o arma un input incorrecto.
// Replica EXACTAMENTE el prompt y la llamada a Ollama que usa
// packages/api/src/reasoning.ts (serializePhase) +
// packages/core/src/adapters/OllamaAdapter.ts, pero fuera del pipeline.
//
// Ronda 1 (A-F): aisló la causa de "elige la tool equivocada" -> sesgo de
// recencia en reasonText (confirmado: solo importa la posición terminal
// de la mención de la tool, no el orden del enum ni la complejidad del schema).
//
// Ronda 2 (G-I, este archivo): con la tool ya eligiéndose bien (F), el
// input seguía mal armado (campo "pattern" filtrado de otras tools, content
// vacío o ausente). Esta ronda aísla dos variables más:
//   G: ¿el leak de "pattern" desaparece si solo se muestra el schema de la
//      tool ya mencionada, en vez de las 3 tools completas?
//   H: ¿el content se sintetiza bien si el reasonText YA incluye el
//      contenido literal a escribir, en vez de solo la intención?
//   I: combinación de ambas (mejor caso posible)
//
// Uso:
//   OLLAMA_URL=http://192.168.1.202:11434 OLLAMA_MODEL=qwen3:4b-instruct node diagnose-serialize-bias.mjs

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://192.168.1.202:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:4b-instruct'
const REPEATS = 3

// --- Réplica exacta de buildToolsDescription (reasoning.ts) ---
function buildToolsDescription(tools) {
  return tools.map(t => {
    const required = t.input_schema.required ?? []
    const props = Object.entries(t.input_schema.properties)
      .map(([k, v]) => `  - ${k} (${v.type})${required.includes(k) ? ' [REQUIRED]' : ''}: ${v.description ?? ''}`)
      .join('\n')
    return `${t.name}: ${t.description}\n${props}`
  }).join('\n\n')
}

// --- Réplica exacta del prompt de serializePhase (reasoning.ts) ---
function buildSerializePrompt(reasonText, tools) {
  const toolsDescription = buildToolsDescription(tools)
  return `You have the following reasoning about what action to take:

${reasonText}

Available tools:
${toolsDescription}

Based on the reasoning above, produce a JSON object representing the tool call. If no tool call is actually needed, respond with just the text "NO_TOOL".

Format: { "tool": "toolName", "input": { ... } }
JSON response:`
}

// --- Réplica exacta de la llamada OllamaAdapter.complete ---
async function callOllama(prompt, toolNames) {
  const responseFormat = {
    type: 'object',
    properties: {
      tool: { type: 'string', enum: toolNames },
      input: { type: 'object' }
    },
    required: ['tool', 'input']
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      format: responseFormat,
      options: { temperature: 0, num_ctx: 8192 }
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ollama API error: ${res.status} - ${body}`)
  }

  const data = await res.json()
  return data.message?.content ?? '(sin content)'
}

// --- Definición de tools (idéntica a c5 en l3-scenarios.ts) ---
const glob = {
  name: 'glob',
  description: 'Find files matching a pattern',
  input_schema: {
    type: 'object',
    properties: { pattern: { type: 'string', description: 'Glob pattern to match' } },
    required: ['pattern']
  }
}

const grep = {
  name: 'grep',
  description: 'Search for a pattern in files',
  input_schema: {
    type: 'object',
    properties: { pattern: { type: 'string', description: 'Pattern to search for' } },
    required: ['pattern']
  }
}

const writeFull = {
  name: 'write',
  description: 'Write content to a file',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to write to' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['path', 'content']
  }
}

const writeSimple = {
  name: 'write',
  description: 'Write content to a file',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to write to' }
    },
    required: ['path']
  }
}

const REASON_TEXT = 'I will use the write tool to create a resumen.txt file listing the names of the log files that contain the word "ERROR".'

const REASON_TEXT_RECENCY = 'To finish this task, the log files that contain "ERROR" must be listed inside a new file named resumen.txt. The tool needed for that final step is the write tool.'

const REASON_TEXT_TERMINAL_MISMA_ORACION = 'I will create a resumen.txt file listing the names of the log files that contain the word "ERROR", using the write tool.'

// Ronda 2: mismo texto terminal, pero con el contenido literal ya resuelto
// (lo que grep ya encontró: app.log y server.log), en vez de solo describir
// la intención de "listar los nombres".
const REASON_TEXT_CONTENIDO_LITERAL = 'The files app.log and server.log contain the word "ERROR". I will create a resumen.txt file with the content "app.log\\nserver.log", using the write tool.'

function validateInput(tool, input) {
  if (tool !== 'write') return { ok: false, detail: 'tool no es write' }
  if (!input || typeof input !== 'object') return { ok: false, detail: 'input no es objeto' }
  const keys = Object.keys(input)
  const leaked = keys.filter(k => k !== 'path' && k !== 'content')
  const pathOk = input.path === 'resumen.txt'
  const contentOk = typeof input.content === 'string' &&
    input.content.includes('app.log') && input.content.includes('server.log')
  const ok = leaked.length === 0 && pathOk && contentOk
  const details = []
  if (leaked.length > 0) details.push(`campos filtrados de otra tool: ${leaked.join(',')}`)
  if (!pathOk) details.push(`path incorrecto: ${JSON.stringify(input.path)}`)
  if (!contentOk) details.push(`content incompleto/vacio: ${JSON.stringify(input.content)}`)
  return { ok, detail: details.join(' | ') || 'ok' }
}

const variants = [
  {
    id: 'A_baseline',
    desc: 'Orden original [glob, grep, write], schema completo (2 campos), reasonText tal cual log',
    tools: [glob, grep, writeFull],
    reasonText: REASON_TEXT
  },
  {
    id: 'B_write_primero',
    desc: 'Orden [write, glob, grep] — write en posición 0, mismo reasonText',
    tools: [writeFull, glob, grep],
    reasonText: REASON_TEXT
  },
  {
    id: 'C_write_medio',
    desc: 'Orden [grep, write, glob] — write en posición 1, mismo reasonText',
    tools: [grep, writeFull, glob],
    reasonText: REASON_TEXT
  },
  {
    id: 'D_schema_simple',
    desc: 'Orden original [glob, grep, write], pero write con schema de 1 solo campo (path)',
    tools: [glob, grep, writeSimple],
    reasonText: REASON_TEXT
  },
  {
    id: 'E_recencia',
    desc: 'Orden original [glob, grep, write], reasonText con "write" mencionado al final del texto (dos oraciones)',
    tools: [glob, grep, writeFull],
    reasonText: REASON_TEXT_RECENCY
  },
  {
    id: 'F_terminal_misma_oracion',
    desc: 'Orden original [glob, grep, write], UNA sola oracion (como el baseline) pero reordenada para que "write tool" quede al final',
    tools: [glob, grep, writeFull],
    reasonText: REASON_TEXT_TERMINAL_MISMA_ORACION
  },
  {
    id: 'G_schema_unico',
    desc: 'Solo se muestra el schema de write (sin glob/grep) — aisla si el leak de "pattern" viene de ver las 3 tools',
    tools: [writeFull],
    reasonText: REASON_TEXT_TERMINAL_MISMA_ORACION
  },
  {
    id: 'H_contenido_literal',
    desc: '3 tools (como prod), pero reasonText ya incluye el contenido literal resuelto (app.log/server.log)',
    tools: [glob, grep, writeFull],
    reasonText: REASON_TEXT_CONTENIDO_LITERAL
  },
  {
    id: 'I_ambos',
    desc: 'Mejor caso: solo schema de write + reasonText con contenido literal ya resuelto',
    tools: [writeFull],
    reasonText: REASON_TEXT_CONTENIDO_LITERAL
  }
]

function parseJson(response) {
  try {
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function main() {
  console.log(`Diagnóstico serializePhase — modelo: ${MODEL} @ ${OLLAMA_URL}`)
  console.log(`Repeticiones por variante: ${REPEATS}\n`)

  const summary = []

  for (const v of variants) {
    console.log('='.repeat(80))
    console.log(`[${v.id}] ${v.desc}`)
    console.log(`Tools en orden: ${v.tools.map(t => t.name).join(', ')}`)
    console.log(`reasonText: "${v.reasonText}"`)
    console.log('-'.repeat(80))

    const toolNames = v.tools.map(t => t.name)
    const prompt = buildSerializePrompt(v.reasonText, v.tools)

    const results = []
    for (let i = 0; i < REPEATS; i++) {
      const raw = await callOllama(prompt, toolNames)
      const parsed = parseJson(raw)
      const chosenTool = parsed?.tool ?? '(parse_failed)'
      const toolCorrect = chosenTool === 'write'
      const inputCheck = toolCorrect ? validateInput(chosenTool, parsed.input) : { ok: false, detail: 'tool incorrecta' }
      const fullyOk = toolCorrect && inputCheck.ok
      results.push({ chosenTool, toolCorrect, inputCheck, fullyOk, raw })
      console.log(`  run ${i + 1}: tool="${chosenTool}" ${toolCorrect ? '✅' : '❌'}  input: ${inputCheck.ok ? '✅' : '❌ ' + inputCheck.detail}`)
      console.log(`           raw=${raw.replace(/\n/g, ' ')}`)
    }

    const fullyOkCount = results.filter(r => r.fullyOk).length
    summary.push({ id: v.id, fullyOkCount, total: REPEATS, chosen: results.map(r => r.chosenTool).join('/') })
    console.log('')
  }

  console.log('='.repeat(80))
  console.log('RESUMEN (tool correcta Y input completo/correcto)')
  console.log('='.repeat(80))
  console.log(`${'Variante'.padEnd(24)} ${'Correctas'.padEnd(12)} Tools elegidas por run`)
  console.log('-'.repeat(80))
  for (const s of summary) {
    console.log(`${s.id.padEnd(24)} ${`${s.fullyOkCount}/${s.total}`.padEnd(12)} ${s.chosen}`)
  }
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
