import { useEasyCMS } from '#easy-cms-local-api'

/** Nitro plugin: connect (and push or verify the schema) at startup so problems show up immediately. */
export default function easyCmsStartup(): void {
  useEasyCMS().catch((error: unknown) => {
    console.error(`[easy-cms] ${error instanceof Error ? error.message : String(error)}`)
  })
}
