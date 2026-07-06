import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { Tool } from '@ezio/core'

const execAsync = promisify(exec)

const run_command: Tool = {
  name: 'run_command',
  description: 'Execute a shell command and return its output',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (optional)' }
    },
    required: ['command']
  }
}

async function executeRunCommand(input: Record<string, unknown>): Promise<string> {
  const command = input.command as string
  const cwd = (input.cwd as string | undefined) ?? process.cwd()

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 30000
    })

    if (stdout) {
      return stdout
    }
    if (stderr) {
      return stderr
    }
    return ''
  } catch (error) {
    if (error instanceof Error) {
      if ('code' in error && typeof (error as Record<string, unknown>).code === 'number') {
        const code = (error as Record<string, unknown>).code as number
        const stderrMsg = error.message
        return `Exit ${code}: ${stderrMsg}`
      }
      return `Error: ${error.message}`
    }
    return `Error: ${String(error)}`
  }
}

export const shellTools: Tool[] = [run_command]

export const shellExecutor: Record<string, (input: Record<string, unknown>) => Promise<string>> = {
  run_command: executeRunCommand
}