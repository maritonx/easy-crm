import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  ConfigError,
  createEasyCMS,
  EasyCMSError,
  generateTypes,
  type Logger,
  loadConfig,
  ValidationError,
} from '@easy-cms/core'

export interface IO {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
  readonly interactive: boolean
  /** Asks a question in the terminal. `hidden` does not echo what is typed (passwords). */
  readonly prompt?: (question: string, options?: { hidden?: boolean }) => Promise<string>
}

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (options.hidden) {
    // Echo nothing while the password is typed.
    const output = rl as unknown as { _writeToOutput: (s: string) => void }
    let asked = false
    output._writeToOutput = (text: string) => {
      if (!asked) {
        process.stdout.write(text)
        asked = true
      }
    }
  }
  try {
    return (await rl.question(question)).trim()
  } finally {
    if (options.hidden) process.stdout.write('\n')
    rl.close()
  }
}

const defaultIO: IO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: ask,
}

const HELP = `Usage: easy-cms <command> [options]

Commands:
  migrate                 Apply pending migrations
  migrate:create <name>   Create a migration from config changes
  migrate:status          List migrations and whether they are applied
  generate:types          Write TypeScript types for your collections and globals
  create-admin            Create an admin user

Options:
  --config <file>         Config file (default: easy-cms.config.ts)
  --cwd <dir>             Project root (default: current directory); its .env is loaded
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
  'generate:types': `Usage: easy-cms generate:types [--out <file>] [options]

Writes interfaces for every collection and global (default: easy-cms-types.ts).
The file has no imports, so a frontend in another repository can copy it.
`,
  'create-admin': `Usage: easy-cms create-admin [--email <email>] [--name <name>] [--role <role>] [options]

Creates a user (role "admin" unless --role is given). The password is asked for in the
terminal, or read from EASY_CMS_ADMIN_PASSWORD when there is no terminal.
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
  loadDotEnv(cwd)
  const logger: Logger = { info: io.out, warn: (m) => io.err(`warning: ${m}`), error: io.err }

  try {
    const config = await loadConfig({
      cwd,
      ...(values.config ? { configFile: values.config } : {}),
    })
    if (command === 'generate:types') {
      const out = values.out ?? 'easy-cms-types.ts'
      const file = isAbsolute(out) ? out : resolve(cwd, out)
      await writeFile(file, generateTypes(config))
      io.out(`Wrote ${file}`)
      return 0
    }
    // create-admin writes a user, so the schema must exist: push in development like the app does.
    const schema =
      command === 'create-admin' && process.env.NODE_ENV !== 'production' ? 'push' : 'skip'
    const cms = await createEasyCMS(config, { cwd, schema, logger, interactive: io.interactive })
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
        case 'create-admin': {
          const email =
            values.email ?? (io.interactive && io.prompt ? await io.prompt('Email: ') : '')
          if (!email) {
            io.err('Missing --email.\n')
            io.err(COMMAND_HELP['create-admin'] as string)
            return 1
          }
          const password =
            process.env.EASY_CMS_ADMIN_PASSWORD ??
            (io.interactive && io.prompt
              ? await io.prompt('Password (8+ characters): ', { hidden: true })
              : '')
          if (!password) {
            io.err('Missing password: run in a terminal or set EASY_CMS_ADMIN_PASSWORD.')
            return 1
          }
          try {
            const user = await cms.create('users', {
              email,
              password,
              role: values.role ?? 'admin',
              ...(values.name ? { name: values.name } : {}),
            })
            io.out(`Created ${user.role} ${user.email}. Log in at ${cms.config.admin.path}`)
            return 0
          } catch (error) {
            if (error instanceof ValidationError) {
              for (const e of error.errors) io.err(`${e.field}: ${e.message}`)
              return 1
            }
            throw error
          }
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
      out: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}

/** Loads `<cwd>/.env` like Nuxt and Next do. Variables already set are kept. */
function loadDotEnv(cwd: string) {
  const file = join(cwd, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}
