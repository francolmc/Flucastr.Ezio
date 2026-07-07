export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3
}

export class Logger {
  private level: LogLevel
  private prefix: string

  constructor(prefix: string = '', level?: LogLevel) {
    const debugEnabled = process.env.EZIO_DEBUG === 'true'
    this.level = debugEnabled ? 'debug' : (level ?? 'info')
    this.prefix = prefix
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVELS[level] < LEVELS[this.level]) return
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const tag = this.prefix ? `[${this.prefix}]` : ''
    const extra = args.length > 0
      ? ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
      : ''
    console.log(`[${ts}] [${level.toUpperCase()}]${tag} ${message}${extra}`)
  }

  debug(msg: string, ...args: unknown[]) { this.log('debug', msg, ...args) }
  info(msg: string, ...args: unknown[])  { this.log('info',  msg, ...args) }
  warn(msg: string, ...args: unknown[])  { this.log('warn',  msg, ...args) }
  error(msg: string, ...args: unknown[]) { this.log('error', msg, ...args) }
}

export function createLogger(prefix: string, level?: LogLevel): Logger {
  return new Logger(prefix, level)
}
