import type { StorageAdapter, StoredFile } from '@easy-cms/core'
import { AwsClient } from 'aws4fetch'

export interface S3StorageOptions {
  /** Bucket name. */
  readonly bucket: string
  /**
   * Region. Default `AWS_REGION`, then `us-east-1`. Use `auto` for Cloudflare R2.
   */
  readonly region?: string
  /**
   * Endpoint for S3-compatible services, e.g. `https://<account>.r2.cloudflarestorage.com` or
   * `http://localhost:9000` (MinIO). Default: AWS S3 for the region.
   */
  readonly endpoint?: string
  /** Default `AWS_ACCESS_KEY_ID`. */
  readonly accessKeyId?: string
  /** Default `AWS_SECRET_ACCESS_KEY`. */
  readonly secretAccessKey?: string
  /** Default `AWS_SESSION_TOKEN`. */
  readonly sessionToken?: string
  /** Prepended to every object key, e.g. `media/`. Default none. */
  readonly prefix?: string
  /**
   * Base URL where the bucket is publicly readable (a CDN, R2 custom domain, or bucket website).
   * When set, media URLs point there. When not set, files are served through the REST API
   * (`<api>/media/file/<key>`), which works with private buckets.
   */
  readonly publicUrl?: string
  /**
   * Address the bucket as `<endpoint>/<bucket>/<key>` instead of `<bucket>.<endpoint>/<key>`.
   * Default: `true` when `endpoint` is set (MinIO needs it, R2 accepts it), otherwise `false`.
   */
  readonly forcePathStyle?: boolean
  /** Fetch implementation. Default the global `fetch`. */
  readonly fetch?: typeof fetch
}

/**
 * Stores uploads in an S3-compatible bucket, for hosts without a persistent disk (Vercel,
 * Netlify, containers):
 *
 * ```ts
 * import { s3Storage } from '@easy-cms/storage-s3'
 *
 * upload: { storage: s3Storage({ bucket: 'my-site-media', region: 'eu-central-1' }) }
 * ```
 *
 * Credentials are read when the CMS starts, not when the config is imported, so builds work
 * without them.
 */
export function s3Storage(options: S3StorageOptions): StorageAdapter {
  const prefix = normalizePrefix(options.prefix)
  let client: AwsClient | undefined
  let objectURL: (key: string) => string = () => {
    throw new Error('s3Storage used before init()')
  }

  const request = async (key: string, init: RequestInit & { method: string }) => {
    if (!client) throw new Error('s3Storage used before init()')
    const signed = await client.sign(objectURL(prefix + key), init)
    return (options.fetch ?? fetch)(signed)
  }

  return {
    name: 's3',

    init() {
      const env = process.env
      const accessKeyId = options.accessKeyId ?? env.AWS_ACCESS_KEY_ID
      const secretAccessKey = options.secretAccessKey ?? env.AWS_SECRET_ACCESS_KEY
      const missing = [
        !options.bucket && '`bucket`',
        !accessKeyId && '`accessKeyId` (or AWS_ACCESS_KEY_ID)',
        !secretAccessKey && '`secretAccessKey` (or AWS_SECRET_ACCESS_KEY)',
      ].filter(Boolean)
      if (missing.length > 0) {
        throw new Error(
          `s3Storage is missing ${missing.join(', ')}.\n    → set them in the server's environment or pass them to s3Storage()`,
        )
      }
      const region = options.region ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1'
      const sessionToken = options.sessionToken ?? env.AWS_SESSION_TOKEN
      client = new AwsClient({
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
        ...(sessionToken ? { sessionToken } : {}),
        service: 's3',
        region,
      })
      objectURL = bucketURL(options, region)
    },

    async put(key, data, { contentType }) {
      const response = await request(key, {
        method: 'PUT',
        body: data as unknown as NonNullable<RequestInit['body']>,
        headers: { 'content-type': contentType, 'content-length': String(data.byteLength) },
      })
      if (!response.ok) throw await s3Error('PUT', key, response)
    },

    async get(key): Promise<StoredFile | null> {
      const response = await request(key, { method: 'GET' })
      if (response.status === 404) return null
      if (!response.ok) throw await s3Error('GET', key, response)
      const body = new Uint8Array(await response.arrayBuffer())
      return { body, size: body.byteLength }
    },

    async delete(key) {
      const response = await request(key, { method: 'DELETE' })
      // S3 answers 204 whether or not the object existed.
      if (!response.ok && response.status !== 404) throw await s3Error('DELETE', key, response)
    },

    url(key) {
      if (!options.publicUrl) return undefined
      return `${options.publicUrl.replace(/\/+$/, '')}/${encodeKey(prefix + key)}`
    },
  }
}

function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return ''
  const trimmed = prefix.replace(/^\/+|\/+$/g, '')
  return trimmed ? `${trimmed}/` : ''
}

/** Percent-encodes each path segment; S3 signs the encoded path. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function bucketURL(options: S3StorageOptions, region: string): (key: string) => string {
  const pathStyle = options.forcePathStyle ?? options.endpoint !== undefined
  const endpoint = new URL(options.endpoint ?? `https://s3.${region}.amazonaws.com`)
  const base = endpoint.origin + endpoint.pathname.replace(/\/+$/, '')
  if (pathStyle) {
    const root = `${base}/${encodeURIComponent(options.bucket)}`
    return (key) => `${root}/${encodeKey(key)}`
  }
  const root = `${endpoint.protocol}//${options.bucket}.${endpoint.host}${endpoint.pathname.replace(/\/+$/, '')}`
  return (key) => `${root}/${encodeKey(key)}`
}

async function s3Error(method: string, key: string, response: Response): Promise<Error> {
  const text = await response.text().catch(() => '')
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
  const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1]
  const detail = [code, message].filter(Boolean).join(': ') || response.statusText
  return new Error(`S3 ${method} ${key} failed (${response.status}): ${detail}`)
}
