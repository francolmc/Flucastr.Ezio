import type { AnthropicToolSchema } from '../src/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ScenarioL3 {
  id: string
  tools: AnthropicToolSchema[]
  seedFiles?: Record<string, string>
  turns: {
    userMessage: string
    mockToolResults?: Record<string, string>
  }[]
  maxToolCallsPerTurn: number
  verify: (sandboxDir: string) => { pass: boolean; reason: string }
}

const bash: AnthropicToolSchema = {
  name: 'bash',
  description: 'Execute a bash command',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' }
    },
    required: ['command']
  }
}

const read: AnthropicToolSchema = {
  name: 'read',
  description: 'Read a file',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to read' }
    },
    required: ['path']
  }
}

const write: AnthropicToolSchema = {
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

const edit: AnthropicToolSchema = {
  name: 'edit',
  description: 'Edit a file by replacing old_string with new_string',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to edit' },
      old_string: { type: 'string', description: 'String to replace' },
      new_string: { type: 'string', description: 'Replacement string' }
    },
    required: ['path', 'old_string', 'new_string']
  }
}

const grep: AnthropicToolSchema = {
  name: 'grep',
  description: 'Search for a pattern in files',
  input_schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Pattern to search for' }
    },
    required: ['pattern']
  }
}

const glob: AnthropicToolSchema = {
  name: 'glob',
  description: 'Find files matching a pattern',
  input_schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' }
    },
    required: ['pattern']
  }
}

const web_search: AnthropicToolSchema = {
  name: 'web_search',
  description: 'Search the web',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  }
}

function fileContains(filePath: string, text: string, sandboxDir: string): boolean {
  try {
    const content = fs.readFileSync(path.join(sandboxDir, filePath), 'utf-8')
    return content.includes(text)
  } catch {
    return false
  }
}

function fileContainsAll(filePath: string, texts: string[], sandboxDir: string): boolean {
  try {
    const content = fs.readFileSync(path.join(sandboxDir, filePath), 'utf-8')
    return texts.every(t => content.includes(t))
  } catch {
    return false
  }
}

function fileEquals(filePath: string, expected: string, sandboxDir: string): boolean {
  try {
    const content = fs.readFileSync(path.join(sandboxDir, filePath), 'utf-8')
    return content.trim() === expected.trim()
  } catch {
    return false
  }
}

export const scenariosL3: ScenarioL3[] = [
  {
    id: 'c1',
    tools: [write, read, edit],
    turns: [
      {
        userMessage:
          "Crea un archivo notas.txt con el texto 'primera nota', después léelo, y agrégale una segunda línea con 'segunda nota'"
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      const pass = fileContainsAll('notas.txt', ['primera nota', 'segunda nota'], sandboxDir)
      return {
        pass,
        reason: pass ? 'ok' : 'notas.txt does not contain both lines'
      }
    }
  },
  {
    id: 'c2',
    tools: [write],
    turns: [
      {
        userMessage:
          'Crea 3 archivos: a.txt, b.txt, c.txt, cada uno con el número correspondiente como contenido (1, 2, 3)'
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      try {
        const a = fs.readFileSync(path.join(sandboxDir, 'a.txt'), 'utf-8')
        const b = fs.readFileSync(path.join(sandboxDir, 'b.txt'), 'utf-8')
        const c = fs.readFileSync(path.join(sandboxDir, 'c.txt'), 'utf-8')
        const pass = a.trim() === '1' && b.trim() === '2' && c.trim() === '3'
        return { pass, reason: pass ? 'ok' : 'files do not have correct content' }
      } catch {
        return { pass: false, reason: 'one or more files missing' }
      }
    }
  },
  {
    id: 'c3',
    tools: [write, read, edit],
    turns: [
      {
        userMessage: 'Crea un archivo config.json con {"port":3000}, léelo, y cambia el puerto a 4000'
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      try {
        const content = fs.readFileSync(path.join(sandboxDir, 'config.json'), 'utf-8')
        const pass = content.includes('4000') && !content.includes('3000')
        return { pass, reason: pass ? 'ok' : 'config.json port not updated to 4000' }
      } catch {
        return { pass: false, reason: 'config.json not found' }
      }
    }
  },
  {
    id: 'c4',
    tools: [glob, write, read],
    turns: [
      {
        userMessage:
          "Lista los archivos en este directorio, crea un archivo readme.md con el texto 'Proyecto Ezio', y confirma leyéndolo"
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      const pass = fileContains('readme.md', 'Proyecto Ezio', sandboxDir)
      return { pass, reason: pass ? 'ok' : 'readme.md not found or missing content' }
    }
  },
  {
    id: 'c5',
    tools: [glob, grep, write],
    seedFiles: {
      'app.log': 'INFO inicio\nERROR fallo conexion',
      'debug.log': 'INFO todo ok',
      'server.log': 'ERROR timeout'
    },
    turns: [
      {
        userMessage:
          "Busca la palabra ERROR en todos los archivos .log, y crea un archivo resumen.txt listando los nombres de los archivos que la contienen"
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      try {
        const content = fs.readFileSync(path.join(sandboxDir, 'resumen.txt'), 'utf-8')
        const hasApp = content.includes('app.log')
        const hasServer = content.includes('server.log')
        const hasDebug = content.includes('debug.log')
        const pass = hasApp && hasServer && !hasDebug
        return {
          pass,
          reason: pass ? 'ok' : `resumen.txt should mention app.log and server.log, not debug.log. Content: ${content}`
        }
      } catch {
        return { pass: false, reason: 'resumen.txt not found' }
      }
    }
  },
  {
    id: 'c6',
    tools: [write, edit],
    turns: [
      {
        userMessage:
          "Crea un archivo tareas.txt con 3 líneas: 'comprar pan', 'llamar al dentista', 'pagar cuentas'. Después edítalo para agregar [DONE] al final de la línea 'llamar al dentista'"
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      try {
        const content = fs.readFileSync(path.join(sandboxDir, 'tareas.txt'), 'utf-8')
        const pass =
          content.includes('comprar pan') &&
          content.includes('llamar al dentista') &&
          content.includes('pagar cuentas') &&
          content.includes('llamar al dentista [DONE]')
        return { pass, reason: pass ? 'ok' : 'tareas.txt missing tasks or [DONE] marker' }
      } catch {
        return { pass: false, reason: 'tareas.txt not found' }
      }
    }
  },
  {
    id: 'c8',
    tools: [write, read, edit],
    turns: [
      {
        userMessage:
          'Crea un archivo log.txt vacío, y agrégale 3 líneas en 3 pasos separados: primero "inicio", después "procesando", después "fin"'
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      try {
        const content = fs.readFileSync(path.join(sandboxDir, 'log.txt'), 'utf-8')
        const lines = content.split('\n').filter(l => l.trim())
        const pass = lines.length === 3 && lines[0] === 'inicio' && lines[1] === 'procesando' && lines[2] === 'fin'
        return { pass, reason: pass ? 'ok' : `log.txt should have 3 lines in order. Content: ${content}` }
      } catch {
        return { pass: false, reason: 'log.txt not found' }
      }
    }
  },
  {
    id: 'c10',
    tools: [write, read, edit],
    turns: [
      {
        userMessage:
          'Crea un archivo contador.txt con el número 0, léelo, e increméntalo en 1 guardándolo de nuevo'
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      const pass = fileEquals('contador.txt', '1', sandboxDir)
      return { pass, reason: pass ? 'ok' : 'contador.txt should contain 1' }
    }
  },
  {
    id: 'c9',
    tools: [glob, read, write],
    seedFiles: {
      'a.py': 'print(1)',
      'b.py': 'print(2)'
    },
    turns: [
      {
        userMessage:
          'Lista los archivos .py en este directorio, lee cada uno, y crea un archivo combinado.py con el contenido de ambos concatenado'
      }
    ],
    maxToolCallsPerTurn: 4,
    verify: (sandboxDir: string) => {
      const pass = fileContainsAll('combinado.py', ['print(1)', 'print(2)'], sandboxDir)
      return { pass, reason: pass ? 'ok' : 'combinado.py missing content from a.py or b.py' }
    }
  },
  {
    id: 'c11',
    tools: [write, read, edit],
    turns: [
      { userMessage: "Crea un archivo proyecto.txt con el texto 'Proyecto Atacama'" },
      {
        userMessage:
          "Ahora agrégale la descripción: 'Sistema de gestión de energía solar'"
      },
      { userMessage: 'Léeme el archivo completo para confirmar' }
    ],
    maxToolCallsPerTurn: 3,
    verify: (sandboxDir: string) => {
      const pass = fileContainsAll('proyecto.txt', ['Proyecto Atacama', 'Sistema de gestión de energía solar'], sandboxDir)
      return { pass, reason: pass ? 'ok' : 'proyecto.txt missing content' }
    }
  },
  {
    id: 'c12',
    tools: [write, edit],
    turns: [
      { userMessage: 'Crea un archivo tareas.txt vacío' },
      { userMessage: "Agrégale la tarea 'comprar pan'" },
      { userMessage: "Agrégale también 'llamar al dentista'" }
    ],
    maxToolCallsPerTurn: 3,
    verify: (sandboxDir: string) => {
      const pass = fileContainsAll('tareas.txt', ['comprar pan', 'llamar al dentista'], sandboxDir)
      return { pass, reason: pass ? 'ok' : 'tareas.txt missing tasks' }
    }
  },
  {
    id: 'c13',
    tools: [web_search, write],
    turns: [
      {
        mockToolResults: {
          'presidente de Francia actual':
            'Según la búsqueda: Emmanuel Macron, presidente de Francia',
          'current president of France':
            'According to the search: Emmanuel Macron, president of France'
        },
        userMessage: 'Busca quién es el actual presidente de Francia'
      },
      { userMessage: 'Ahora guarda esa información en un archivo francia.txt' }
    ],
    maxToolCallsPerTurn: 3,
    verify: (sandboxDir: string) => {
      const pass = fileContains('francia.txt', 'Emmanuel Macron', sandboxDir)
      return { pass, reason: pass ? 'ok' : 'francia.txt should contain Emmanuel Macron' }
    }
  },
  {
    id: 'c14',
    tools: [write, read, edit],
    turns: [
      { userMessage: 'Crea un archivo numeros.txt con el número 5' },
      {
        userMessage:
          'Súmale 10 al número que está en el archivo y guárdalo'
      },
      { userMessage: 'Ahora réstale 3 y guárdalo de nuevo' }
    ],
    maxToolCallsPerTurn: 3,
    verify: (sandboxDir: string) => {
      const pass = fileEquals('numeros.txt', '12', sandboxDir)
      return { pass, reason: pass ? 'ok' : 'numeros.txt should contain 12' }
    }
  }
]
