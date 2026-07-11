import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { Tool } from '@ezio/core'

const MAX_CONTENT_LENGTH = 50000

function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

const read_file: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file at the given path',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file' }
    },
    required: ['path']
  }
}

const write_file: Tool = {
  name: 'write_file',
  description: 'Write content to a file, creating it if it does not exist',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['path', 'content']
  }
}

const list_directory: Tool = {
  name: 'list_directory',
  description: 'List files and directories at the given path. Use filter to narrow by glob pattern — supports "*" (any characters) and "?" (one character), e.g. "*.zip", "prueba*", "*veterinaria*". Multiple patterns can be separated by ";" or ",", e.g. "*.pdf;*.docx". Use limit to cap results.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the directory' },
      filter: { type: 'string', description: 'Optional glob pattern to filter files, e.g. "*.zip" or "*.csv"' },
      limit: { type: 'number', description: 'Optional max number of results to return (default: all)' }
    },
    required: ['path']
  }
}

const create_directory: Tool = {
  name: 'create_directory',
  description: 'Create a directory and all parent directories if needed',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to create' }
    },
    required: ['path']
  }
}

const move_file: Tool = {
  name: 'move_file',
  description: 'Move or rename a file or directory to a new location',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Absolute path of source' },
      destination: { type: 'string', description: 'Absolute path of destination' }
    },
    required: ['source', 'destination']
  }
}

const delete_file: Tool = {
  name: 'delete_file',
  description: 'Delete a file (NOT directories). Use with caution.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to file to delete' }
    },
    required: ['path']
  }
}

async function executeReadFile(input: Record<string, unknown>): Promise<string> {
  const filePath = expandPath(input.path as string)
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      return `Error: path '${filePath}' is a directory, not a file`
    }
    const content = await fs.readFile(filePath, 'utf-8')
    if (content.length > MAX_CONTENT_LENGTH) {
      return content.slice(0, MAX_CONTENT_LENGTH) + '\n[truncated]'
    }
    return content
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return `Error: file not found at '${filePath}'`
    }
    return `Error reading file: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function executeWriteFile(input: Record<string, unknown>): Promise<string> {
  const filePath = expandPath(input.path as string)
  const content = input.content as string
  try {
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return `File written: ${filePath}`
  } catch (error) {
    return `Error writing file: ${error instanceof Error ? error.message : String(error)}`
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function buildFilterMatcher(filter: string | undefined): ((name: string) => boolean) | null {
  if (!filter) return null
  const patterns = filter.split(/[;,]/).map(p => p.trim()).filter(Boolean)
  if (patterns.length === 0) return null
  const regexes = patterns.map(globToRegex)
  return (name: string) => regexes.some(r => r.test(name))
}

async function executeListDirectory(input: Record<string, unknown>): Promise<string> {
  const dirPath = expandPath(input.path as string)

  try {
    const filterStr = input.filter as string | undefined
    const matchesFilter = buildFilterMatcher(filterStr)

    const limit = input.limit as number | undefined

    const allEntries = await fs.readdir(dirPath, { withFileTypes: true })

    let entries: typeof allEntries
    let totalFiltered: number

    if (matchesFilter) {
      const matched = allEntries.filter(e => matchesFilter(e.name))
      const unmatchedDirs = allEntries.filter(e => e.isDirectory() && !matchesFilter(e.name))
      entries = limit && limit > 0 ? matched.slice(0, limit) : matched
      totalFiltered = matched.filter(e => e.isFile()).length

      const lines: string[] = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          lines.push(`[DIR]  ${entry.name}/`)
        } else {
          lines.push(`[FILE] ${entry.name}`)
        }
      }

      if (unmatchedDirs.length > 0) {
        lines.push(`\n(${unmatchedDirs.length} other directories not matching filter, not shown)`)
      }

      lines.push(`\nTotal: ${entries.length} items${filterStr ? ` (${totalFiltered} files matching ${filterStr})` : ''}`)

      return lines.join('\n')
    } else {
      entries = allEntries
      if (limit && limit > 0) {
        entries = entries.slice(0, limit)
      }
      totalFiltered = allEntries.length

      const lines: string[] = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          lines.push(`[DIR]  ${entry.name}/`)
        } else {
          try {
            const fullPath = path.join(dirPath, entry.name)
            const stat = await fs.stat(fullPath)
            lines.push(`[FILE] ${entry.name}  (${stat.size} bytes)`)
          } catch {
            lines.push(`[FILE] ${entry.name}`)
          }
        }
      }

      lines.push(`\nTotal: ${entries.length} items`)

      return lines.join('\n')
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Error: directory not found at '${dirPath}'`
      }
    }
    return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function executeCreateDirectory(input: Record<string, unknown>): Promise<string> {
  const dirPath = expandPath(input.path as string)
  try {
    const stat = await fs.stat(dirPath)
    if (stat.isDirectory()) {
      return `Directory already exists: ${dirPath}`
    }
    throw Object.assign(new Error('Path exists as file'), { code: 'EEXIST' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw error
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true })
      return `Directory created: ${dirPath}`
    }
    throw error
  }
}

async function executeMoveFile(input: Record<string, unknown>): Promise<string> {
  const source = expandPath(input.source as string)
  let destination = expandPath(input.destination as string)

  const srcBasename = path.basename(source)

  try {
    const destStat = await fs.stat(destination)
    if (destStat.isDirectory()) {
      destination = path.join(destination, srcBasename)
    }
  } catch {
    if ((input.destination as string).endsWith('/')) {
      destination = path.join(destination, srcBasename)
    }
  }

  try {
    await fs.rename(source, destination)
    return `Moved: ${source} → ${destination}`
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return `Error: source not found at '${source}'`
    }
    return `Error moving file: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function executeDeleteFile(input: Record<string, unknown>): Promise<string> {
  const filePath = expandPath(input.path as string)
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      return `Error: path '${filePath}' is a directory, not a file. Use a different tool to delete directories.`
    }
    await fs.unlink(filePath)
    return `Deleted: ${filePath}`
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return `Error: file not found at '${filePath}'`
    }
    return `Error deleting file: ${error instanceof Error ? error.message : String(error)}`
  }
}

export const filesystemTools: Tool[] = [read_file, write_file, list_directory, create_directory, move_file, delete_file]

export const filesystemExecutor: Record<string, (input: Record<string, unknown>) => Promise<string>> = {
  read_file: executeReadFile,
  write_file: executeWriteFile,
  list_directory: executeListDirectory,
  create_directory: executeCreateDirectory,
  move_file: executeMoveFile,
  delete_file: executeDeleteFile
}