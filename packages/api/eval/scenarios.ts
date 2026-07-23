import type { AnthropicToolSchema } from '../src/types.js'

export interface ScenarioL2 {
  id: string
  level: 'simple' | 'moderate' | 'complex'
  userMessage: string
  tools: AnthropicToolSchema[]
  n?: number
  expected: {
    type: 'text' | 'tool_use'
    acceptableTools?: string[]
    structuredFields?: Record<string, unknown>
    freeTextFields?: Record<string, RegExp>
  }
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

const send_email: AnthropicToolSchema = {
  name: 'send_email',
  description: 'Send an email',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body' }
    },
    required: ['to', 'subject', 'body']
  }
}

export const scenarios: ScenarioL2[] = [
  {
    id: 's1',
    level: 'simple',
    userMessage: 'hola, cómo estás',
    tools: [],
    expected: { type: 'text' }
  },
  {
    id: 's2',
    level: 'simple',
    userMessage: 'qué es la fotosíntesis',
    tools: [],
    expected: { type: 'text' }
  },
  {
    id: 's3',
    level: 'simple',
    userMessage: 'escribe un poema corto sobre el mar',
    tools: [],
    expected: { type: 'text' }
  },
  {
    id: 's4',
    level: 'simple',
    userMessage: 'cuál es la capital de Francia',
    tools: [],
    expected: { type: 'text' }
  },
  {
    id: 'm1',
    level: 'moderate',
    userMessage: 'lista los archivos en este directorio',
    tools: [bash],
    expected: {
      type: 'tool_use',
      acceptableTools: ['bash'],
      freeTextFields: { command: /ls/i }
    }
  },
  {
    id: 'm2',
    level: 'moderate',
    userMessage: 'busca el clima en Copiapó',
    tools: [web_search],
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /copiap.*clima|clima.*copiap/i }
    }
  },
  {
    id: 'm3',
    level: 'moderate',
    userMessage: 'lee el archivo package.json',
    tools: [read],
    expected: {
      type: 'tool_use',
      acceptableTools: ['read'],
      freeTextFields: { path: /package\.json/ }
    }
  },
  {
    id: 'm4',
    level: 'moderate',
    userMessage: 'quién es el actual presidente de Chile',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /presiden.*chile|chile.*presiden/i }
    }
  },
  {
    id: 'm5',
    level: 'moderate',
    userMessage: 'busca archivos .ts en la carpeta src',
    tools: [glob],
    expected: {
      type: 'tool_use',
      acceptableTools: ['glob'],
      freeTextFields: { pattern: /\.ts/ }
    }
  },
  {
    id: 'm6',
    level: 'moderate',
    userMessage: 'busca la palabra TODO en el código',
    tools: [grep],
    expected: {
      type: 'tool_use',
      acceptableTools: ['grep'],
      freeTextFields: { pattern: /TODO/ }
    }
  },
  {
    id: 'm7',
    level: 'moderate',
    userMessage: "crea un archivo notas.txt con el texto 'reunión mañana'",
    tools: [write],
    expected: {
      type: 'tool_use',
      acceptableTools: ['write'],
      structuredFields: { path: 'notas.txt' },
      freeTextFields: { content: /reuni.n/i }
    }
  },
  {
    id: 'm8',
    level: 'moderate',
    userMessage: 'genera un diagrama en mermaid y guárdalo en diagram.md',
    tools: [write],
    expected: {
      type: 'tool_use',
      acceptableTools: ['write'],
      structuredFields: { path: 'diagram.md' }
    }
  },
  {
    id: 'm9',
    level: 'moderate',
    userMessage: 'envía un correo a juan@example.com diciendo que la reunión se pospone',
    tools: [send_email],
    expected: {
      type: 'tool_use',
      acceptableTools: ['send_email'],
      structuredFields: { to: 'juan@example.com' },
      freeTextFields: { body: /pospon|postpon|reuni.n|meeting/i }
    }
  },
  {
    id: 'm10',
    level: 'moderate',
    userMessage: 'modifica el archivo config.ts y cambia el puerto a 3000',
    tools: [edit],
    expected: {
      type: 'tool_use',
      acceptableTools: ['edit'],
      freeTextFields: { path: /config\.ts/ }
    }
  },
  {
    id: 'm11',
    level: 'moderate',
    userMessage: 'quién es el actual CEO de OpenAI',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /ceo.*openai|openai.*ceo/i }
    }
  },
  {
    id: 'm12',
    level: 'moderate',
    userMessage: 'cuál es el precio actual del dólar en Chile',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /dollar.*chile|d.lar.*chile|price.*chile|precio.*chile|clp/i }
    }
  },
  {
    id: 'm13',
    level: 'moderate',
    userMessage: 'quién ganó el mundial más reciente',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /mundial|world cup/i }
    }
  },
  {
    id: 'm14',
    level: 'moderate',
    userMessage: 'cuál es la capital actual de Alemania',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'text'
    }
  },
  {
    id: 'm15',
    level: 'moderate',
    userMessage: 'quién es el actual presidente de Argentina',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /argentina/i }
    }
  },
  {
    id: 'm16',
    level: 'moderate',
    userMessage: 'cuál es la última versión de node.js',
    tools: [web_search],
    n: 10,
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search'],
      freeTextFields: { query: /node/i }
    }
  },
  {
    id: 'c1',
    level: 'complex',
    userMessage: 'analiza la carpeta src y crea un resumen en resumen.md',
    tools: [bash, glob, read, write],
    expected: {
      type: 'tool_use',
      acceptableTools: ['bash', 'glob', 'read']
    }
  },
  {
    id: 'c2',
    level: 'complex',
    userMessage: 'lista los archivos, busca la palabra error en cada uno, y crea un reporte',
    tools: [bash, grep, write],
    expected: {
      type: 'tool_use',
      acceptableTools: ['bash', 'glob', 'grep']
    }
  },
  {
    id: 'c3',
    level: 'complex',
    userMessage: 'busca información sobre Chile en la web y guárdala en un archivo chile.md',
    tools: [web_search, write],
    expected: {
      type: 'tool_use',
      acceptableTools: ['web_search']
    }
  },
  {
    id: 'c4',
    level: 'complex',
    userMessage: 'lee el archivo config.json y luego modifica el puerto a 3000',
    tools: [read, edit],
    expected: {
      type: 'tool_use',
      acceptableTools: ['read']
    }
  }
]
