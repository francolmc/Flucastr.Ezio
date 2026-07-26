import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

export function createSandbox(): string {
  const tmpDir = os.tmpdir()
  const suffix = `-ezio-l3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const sandboxDir = fs.mkdtempSync(path.join(tmpDir, suffix))
  return sandboxDir
}

export function cleanupSandbox(sandboxDir: string): void {
  fs.rmSync(sandboxDir, { recursive: true, force: true })
}

function safePath(sandboxDir: string, inputPath: string): string {
  const resolved = path.resolve(sandboxDir, inputPath)
  const relative = path.relative(sandboxDir, resolved)
  if (relative.startsWith('..')) {
    throw new Error(`Path escape attempt detected: ${inputPath}`)
  }
  return resolved
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function matchMockResult(query: string, mockToolResults: Record<string, string>): string | null {
  if (query in mockToolResults) return mockToolResults[query]

  const normalizedQuery = normalizeForMatch(query)

  for (const [key, value] of Object.entries(mockToolResults)) {
    if (normalizeForMatch(key) === normalizedQuery) return value
  }

  for (const [key, value] of Object.entries(mockToolResults)) {
    const normalizedKey = normalizeForMatch(key)
    if (normalizedQuery.includes(normalizedKey) || normalizedKey.includes(normalizedQuery)) {
      return value
    }
  }

  for (const [key, value] of Object.entries(mockToolResults)) {
    const keyWords = normalizeForMatch(key).split(/\s+/).filter(w => w.length >= 4)
    if (keyWords.length > 0 && keyWords.every(w => normalizedQuery.includes(w))) {
      return value
    }
  }

  return null
}

export function executeTool(
  sandboxDir: string,
  toolName: string,
  input: Record<string, unknown>,
  mockToolResults?: Record<string, string>
): string {
  switch (toolName) {
    case 'bash': {
      const command = input.command as string
      try {
        const stdout = execSync(command, {
          cwd: sandboxDir,
          timeout: 5000,
          encoding: 'utf-8'
        })
        return stdout.trim()
      } catch (err: unknown) {
        const error = err as { stderr?: string; message?: string }
        return error.stderr?.trim() || error.message || 'Command failed'
      }
    }

    case 'read': {
      const filePath = safePath(sandboxDir, input.path as string)
      try {
        return fs.readFileSync(filePath, 'utf-8')
      } catch (err: unknown) {
        const error = err as { message?: string }
        return `Error reading file: ${error.message || String(err)}`
      }
    }

    case 'write': {
      const filePath = safePath(sandboxDir, input.path as string)
      const content = input.content as string
      try {
        fs.writeFileSync(filePath, content, 'utf-8')
        return 'Archivo escrito correctamente'
      } catch (err: unknown) {
        const error = err as { message?: string }
        return `Error writing file: ${error.message || String(err)}`
      }
    }

    case 'edit': {
      const filePath = safePath(sandboxDir, input.path as string)
      const oldString = input.old_string as string
      const newString = input.new_string as string
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const index = content.indexOf(oldString)
        if (index === -1) {
          return `Error: old_string "${oldString}" not found in file`
        }
        const newContent = content.replace(oldString, newString)
        fs.writeFileSync(filePath, newContent, 'utf-8')
        return 'Archivo editado correctamente'
      } catch (err: unknown) {
        const error = err as { message?: string }
        return `Error editing file: ${error.message || String(err)}`
      }
    }

    case 'glob': {
      const pattern = input.pattern as string
      try {
        const files = fs.readdirSync(sandboxDir)
        const isGlob = pattern.includes('*')
        if (isGlob) {
          const ext = pattern.replace('*', '')
          return files.filter(f => f.endsWith(ext)).join('\n')
        } else {
          return files.filter(f => f.includes(pattern)).join('\n')
        }
      } catch (err: unknown) {
        const error = err as { message?: string }
        return `Error listing files: ${error.message || String(err)}`
      }
    }

    case 'grep': {
      const searchPattern = input.pattern as string
      try {
        const files = fs.readdirSync(sandboxDir)
        const results: string[] = []
        for (const file of files) {
          const filePath = path.join(sandboxDir, file)
          const stat = fs.statSync(filePath)
          if (!stat.isFile()) continue
          const content = fs.readFileSync(filePath, 'utf-8')
          const lines = content.split('\n')
          const regex = new RegExp(searchPattern)
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${file}:${i + 1}: ${lines[i]}`)
            }
          }
        }
        return results.length > 0 ? results.join('\n') : 'No matches found'
      } catch (err: unknown) {
        const error = err as { message?: string }
        return `Error searching: ${error.message || String(err)}`
      }
    }

    case 'web_search': {
      const query = input.query as string
      if (mockToolResults) {
        const matched = matchMockResult(query, mockToolResults)
        if (matched !== null) return matched
      }
      return `Mock web_search result for: ${query}`
    }

    default:
      return `Unknown tool: ${toolName}`
  }
}
