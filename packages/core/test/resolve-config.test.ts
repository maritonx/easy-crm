import { describe, expect, it } from 'vitest'
import { ConfigError, type Plugin, resolveConfig } from '../src/index.js'
import { baseConfig } from './helpers.js'

describe('resolveConfig', () => {
  it('applies defaults', async () => {
    const config = await resolveConfig(baseConfig())
    expect(config.admin).toEqual({ path: '/admin', locale: 'en' })
    expect(config.upload).toEqual({
      dir: 'uploads',
      maxFileSize: 10 * 1024 * 1024,
      mimeTypes: ['image/*', 'application/pdf'],
      imageSizes: [],
    })
    expect(config.auth).toEqual({
      roles: ['admin', 'editor'],
      tokenExpiration: 7 * 24 * 60 * 60,
      maxLoginAttempts: 5,
      lockWindow: 15 * 60,
      trustedOrigins: [],
    })
    expect(config.collections.map((c) => c.slug)).toEqual([
      'users',
      'media',
      'sessions',
      'login-attempts',
    ])
    expect(config.routes).toEqual({ api: '/api/cms' })
    expect(config.globals).toEqual([])
    expect(config).not.toHaveProperty('plugins')
  })

  it('keeps values that were set', async () => {
    const config = await resolveConfig(baseConfig({ admin: { path: '/cms', locale: 'th' } }))
    expect(config.admin).toEqual({ path: '/cms', locale: 'th' })
  })

  it('throws ConfigError listing every issue', async () => {
    const error = await resolveConfig(baseConfig({ secret: 'short', admin: { path: 'x' } })).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(ConfigError)
    expect(error.issues).toHaveLength(2)
    expect(error.message).toContain('Invalid Easy CMS config (2 problems)')
    expect(error.message).toContain('secret: must be at least 32 characters')
    expect(error.message).toContain('→ set EASY_CMS_SECRET')
  })

  describe('plugins (FR-CFG-05)', () => {
    it('run in order before validation', async () => {
      const calls: string[] = []
      const addPosts: Plugin = (config) => {
        calls.push('addPosts')
        return {
          ...config,
          collections: [...(config.collections ?? []), { slug: 'posts', fields: [] }],
        }
      }
      const addAuthor: Plugin = async (config) => {
        calls.push('addAuthor')
        return {
          ...config,
          collections: (config.collections ?? []).map((c) =>
            c.slug === 'posts'
              ? {
                  ...c,
                  fields: [...c.fields, { name: 'author', type: 'relationship', to: 'users' }],
                }
              : c,
          ),
        }
      }
      const config = await resolveConfig(baseConfig({ plugins: [addPosts, addAuthor] }))
      expect(calls).toEqual(['addPosts', 'addAuthor'])
      expect(config.collections.find((c) => c.slug === 'posts')?.fields.map((f) => f.name)).toEqual(
        ['author'],
      )
    })

    it('have their output validated', async () => {
      const broken: Plugin = (config) => ({
        ...config,
        collections: [{ slug: 'Bad Slug', fields: [] }],
      })
      await expect(resolveConfig(baseConfig({ plugins: [broken] }))).rejects.toThrow(ConfigError)
    })
  })
})
