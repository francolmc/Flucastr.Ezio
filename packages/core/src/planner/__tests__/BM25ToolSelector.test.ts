import { describe, it, expect } from 'vitest'
import type { Tool } from '../../types/index'
import { BM25ToolSelector } from '../BM25ToolSelector'

const OPENCODE_TOOLS: Tool[] = [
  {
    name: 'bash',
    description: 'Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.\n\nBe aware: OS: darwin, Shell: zsh\n\nAll commands run in the current working directory by default. Use the `workdir` parameter if you need to run a command in a different directory. AVOID using `cd <directory> && <command>` patterns - use `workdir` instead.',
    inputSchema: {}
  },
  {
    name: 'edit',
    description: 'Performs exact string replacements in files.\n\nUsage:\n- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.\n- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: line number + colon + space (e.g., `1: `). Everything after that space is the actual file content to match.',
    inputSchema: {}
  },
  {
    name: 'glob',
    description: '- Fast file pattern matching tool that works with any codebase size\n- Supports glob patterns like "**/*.js" or "src/**/*.ts"\n- Returns matching file paths\n- Use this tool when you need to find files by name patterns\n- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead',
    inputSchema: {}
  },
  {
    name: 'grep',
    description: '- Fast content search tool that works with any codebase size\n- Searches file contents using regular expressions\n- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+", etc.)\n- Filter files by pattern with the include parameter (e.g., "*.js", "*.{ts,tsx}")\n- Returns file paths and line numbers with matching lines',
    inputSchema: {}
  },
  {
    name: 'question',
    description: 'Use this tool when you need to ask the user questions during execution. This allows you to:\n1. Gather user preferences or requirements\n2. Clarify ambiguous instructions\n3. Get decisions on implementation choices as you work\n4. Offer choices to the user about what direction to take.',
    inputSchema: {}
  },
  {
    name: 'read',
    description: 'Read a file or directory from the local filesystem. If the path does not exist, an error is returned.\n\nUsage:\n- The filePath parameter should be an absolute path.\n- By default, this tool returns up to 2000 lines from the start of the file.\n- The offset parameter is the line number to start from (1-indexed).\n- To read later sections, call this tool again with a larger offset.',
    inputSchema: {}
  },
  {
    name: 'skill',
    description: 'Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.\n\nUse this tool to inject the skill instructions and resources into current conversation. The output may contain detailed workflow guidance as well as references to scripts, files, etc. in the same directory as the skill.',
    inputSchema: {}
  },
  {
    name: 'task',
    description: 'Launch a new agent to handle complex, multistep tasks autonomously.\n\nWhen using the Task tool, you must specify a subagent_type parameter to select which agent type to use.\n\nWhen NOT to use the Task tool:\n- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly',
    inputSchema: {}
  },
  {
    name: 'todowrite',
    description: 'Create and maintain a structured task list for the current coding session. Tracks progress, organizes multi-step work, and surfaces status to the user.\n\n## When to use\nUse proactively when:\n- The task requires 3+ distinct steps or actions (not just 3 tool calls for a single conceptual step)\n- The work is non-trivial and benefits from planning',
    inputSchema: {}
  },
  {
    name: 'webfetch',
    description: '- Fetches content from a specified URL\n- Takes a URL and optional format as input\n- Fetches the URL content, converts to requested format (markdown by default)\n- Returns the content in the specified format\n- Use this tool when you need to retrieve and analyze web content',
    inputSchema: {}
  },
  {
    name: 'write',
    description: 'Writes a file to the local filesystem.\n\nUsage:\n- This tool will overwrite the existing file if there is one at the provided path.\n- If this is an existing file, you MUST use the Read tool first to read the file contents. This tool will fail if you did not read the file first.\n- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.',
    inputSchema: {}
  }
]

describe('BM25ToolSelector', () => {
  const selector = new BM25ToolSelector()

  it('selects bash for "lista los archivos en este directorio" (real case)', () => {
    const objective = 'lista los archivos en este directorio'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('bash')
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('selects glob for "find all ts files in src"', () => {
    const objective = 'find all ts files in src'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('glob')
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('selects read for "read the contents of file.txt"', () => {
    const objective = 'read the contents of file.txt'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('read')
  })

  it('selects grep for "search for error in logs"', () => {
    const objective = 'search for error in logs'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('grep')
  })

  it('selects write for "create a new file with content"', () => {
    const objective = 'create a new file with content'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('write')
  })

  it('selects edit for "modify the existing file"', () => {
    const objective = 'modify the existing file'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('edit')
  })

  it('selects question for "ask the user for confirmation"', () => {
    const objective = 'ask the user for confirmation'
    const result = selector.select(objective, OPENCODE_TOOLS, 5)
    const selectedNames = result.map(t => t.name)

    expect(selectedNames).toContain('question')
  })

  it('respects maxTools parameter', () => {
    const result = selector.select('file', OPENCODE_TOOLS, 3)
    expect(result.length).toBe(3)
  })

  it('returns all tools when no lexical overlap exists (fail-safe)', () => {
    const tools = [
      { name: 'foo', description: 'foo tool', inputSchema: {} },
      { name: 'bar', description: 'bar tool', inputSchema: {} }
    ]
    const result = selector.select('xyzabc123 no match', tools, 5)
    expect(result.length).toBe(2)
  })

  it('filters out DEPRECATED tools', () => {
    const tools = [
      { name: 'read', description: 'reads a file', inputSchema: {} },
      { name: 'old', description: 'DEPRECATED: old tool', inputSchema: {} }
    ]
    const result = selector.select('read', tools, 5)
    expect(result.map(t => t.name)).not.toContain('old')
  })

  it('handles empty tools array', () => {
    const result = selector.select('test', [], 5)
    expect(result).toHaveLength(0)
  })

  it('handles empty objective', () => {
    const result = selector.select('', OPENCODE_TOOLS, 5)
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('uses full description, not just first line', () => {
    const tools = [
      {
        name: 'specific',
        description: 'this is a very specific tool that does something unique with json and api calls',
        inputSchema: {}
      },
      {
        name: 'generic',
        description: 'does stuff',
        inputSchema: {}
      }
    ]
    const result = selector.select('json api', tools, 2)
    expect(result[0].name).toBe('specific')
  })

  it('sorts by BM25 score descending', () => {
    const tools = [
      { name: 'read', description: 'read files from filesystem', inputSchema: {} },
      { name: 'write', description: 'write files to filesystem', inputSchema: {} },
      { name: 'bash', description: 'execute bash commands', inputSchema: {} }
    ]
    const result = selector.select('read a file', tools, 3)
    expect(result[0].name).toBe('read')
  })
})
