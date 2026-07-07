import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../utils/Logger'

const logger = createLogger('Migrations')

export class MigrationRunner {
  constructor(private db: DatabaseSync) {}

  run(migrationsDir: string): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `)

    const currentVersion = this.getCurrentVersion()

    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    let applied = 0
    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10)
      if (version <= currentVersion) continue

      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      logger.info(`Applying migration ${file}`)

      this.db.exec(sql)
      this.db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(version, Date.now())

      applied++
    }

    if (applied > 0) {
      logger.info(`Applied ${applied} migration(s). Schema at v${this.getCurrentVersion()}`)
    } else {
      logger.debug(`Schema up to date at v${this.getCurrentVersion()}`)
    }
  }

  private getCurrentVersion(): number {
    try {
      const row = this.db.prepare(
        'SELECT MAX(version) as v FROM schema_migrations'
      ).get() as { v: number | null }
      return row?.v ?? 0
    } catch {
      return 0
    }
  }
}

export function createMigrationRunner(db: DatabaseSync): MigrationRunner {
  return new MigrationRunner(db)
}
