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
  description: 'List files and directories at the given path',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the directory' }
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

async function executeListDirectory(input: Record<string, unknown>): Promise<string> {
  const dirPath = expandPath(input.path as string)
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const lines = await Promise.all(entries.map(async entry => {
      if (entry.isDirectory()) {
        return `[DIR]  ${entry.name}/`
      } else {
        const fullPath = path.join(dirPath, entry.name)
        const stat = await fs.stat(fullPath)
        return `[FILE] ${entry.name}  (${stat.size} bytes)`
      }
    }))
    return lines.join('\n')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return `Error: directory not found at '${dirPath}'`
    }
    return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`
  }
}

export const filesystemTools: Tool[] = [read_file, write_file, list_directory]

export const filesystemExecutor: Record<string, (input: Record<string, unknown>) => Promise<string>> = {
  read_file: executeReadFile,
  write_file: executeWriteFile,
  list_directory: executeListDirectory
}