import { parseArgs } from 'node:util'
import { ConfigError, createEasyCMS, EasyCMSError, type Logger, loadConfig } from '@easy-cms/core'

export interface IO {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
  readonly interactive: boolean
}

const defaultIO: IO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
}

const HELP = `Usage: easy-cms <command> [options]

Commands:
  migrate                 Apply pending migrations
  migrate:create <name>   Create a migration from config changes
  migrate:status          List migrations and whether they are applied

Options:
  --config <file>         Config file (default: easy-cms.config.ts)
  --cwd <dir>             Project root (default: current directory)
  -h, --help              Show help
`

const COMMAND_HELP: Record<string, string> = {
  migrate: `Usage: easy-cms migrate [options]

Applies every migration in easy-cms/migrations that the database has not run yet.
Each migration runs in its own transaction; a failure rolls it back and stops.
`,
  'migrate:create': `Usage: easy-cms migrate:create <name> [options]

Compares the config with the latest migration and writes a new migration
(easy-cms/migrations/<timestamp>_<name>.sql) if anything changed.
In a terminal you are asked whether changed fields were renamed.
`,
  'migrate:status': `Usage: easy-cms migrate:status [options]

Lists migration files and whether each has been applied.
`,
}

/** Runs the CLI and returns the exit code. */
export async function run(argv: readonly string[], io: IO = defaultIO): Promise<number> {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    io.err((error as Error).message)
    io.err(HELP)
    return 1
  }
  const { values, positionals } = parsed
  const [command, ...rest] = positionals

  if (!command) {
    ;(values.help ? io.out : io.err)(HELP)
    return values.help ? 0 : 1
  }
  if (!(command in COMMAND_HELP)) {
    io.err(`Unknown command "${command}".\n`)
    io.err(HELP)
    return 1
  }
  if (values.help) {
    io.out(COMMAND_HELP[command] as string)
    return 0
  }

  const cwd = values.cwd ?? process.cwd()
  const logger: Logger = { info: io.out, warn: (m) => io.err(`warning: ${m}`), error: io.err }

  try {
    const config = await loadConfig({
      cwd,
      ...(values.config ? { configFile: values.config } : {}),
    })
    const cms = await createEasyCMS(config, {
      cwd,
      schema: 'skip',
      logger,
      interactive: io.interactive,
    })
    try {
      switch (command) {
        case 'migrate': {
          const applied = await cms.db.migrate()
          io.out(
            applied.length === 0
              ? 'No pending migrations.'
              : `Applied ${applied.length} migration(s).`,
          )
          return 0
        }
        case 'migrate:create': {
          const name = rest.join(' ').trim()
          if (!name) {
            io.err('Missing migration name.\n')
            io.err(COMMAND_HELP['migrate:create'] as string)
            return 1
          }
          const created = await cms.db.createMigration({ name })
          if (!created) {
            io.out('No changes; nothing to migrate.')
          } else {
            io.out(`Created ${created.file} (${created.statements.length} statements).`)
            io.out('Review it, commit it, then run `easy-cms migrate` where you deploy.')
          }
          return 0
        }
        case 'migrate:status': {
          const list = await cms.db.migrationStatus()
          if (list.length === 0)
            io.out('No migrations yet. Create one with `easy-cms migrate:create init`.')
          for (const m of list) io.out(`${m.applied ? '✓ applied' : '• pending'}  ${m.name}`)
          return 0
        }
      }
      return 1
    } finally {
      await cms.destroy()
    }
  } catch (error) {
    const known = error instanceof ConfigError || error instanceof EasyCMSError
    if (error instanceof Error)
      io.err(!known && process.env.DEBUG ? (error.stack ?? error.message) : error.message)
    else io.err(String(error))
    return 1
  }
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      cwd: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}
