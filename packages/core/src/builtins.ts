import { type Access, anyone, isAdmin, isLoggedIn } from './access.js'
import type { CollectionConfig, Config } from './config.js'
import type { Field } from './fields.js'

export const USERS = 'users'
export const MEDIA = 'media'
export const SESSIONS = 'sessions'
export const LOGIN_ATTEMPTS = 'login-attempts'

/** Collections Easy CMS uses internally. Not exposed over REST or in the admin UI. */
export const INTERNAL_COLLECTIONS: ReadonlySet<string> = new Set([SESSIONS, LOGIN_ATTEMPTS])

export const DEFAULT_ROLES = ['admin', 'editor'] as const

/** Admins can update anyone; other users only themselves. */
const adminOrSelf: Access = ({ user }) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return { id: { equals: user.id } }
}

const adminOnly = {
  update: ({ user }: { user: { role: string } | null }) => user?.role === 'admin',
}

function userFields(roles: readonly string[]): Field[] {
  return [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      label: { en: 'Email', th: 'อีเมล' },
    },
    { name: 'name', type: 'text', label: { en: 'Name', th: 'ชื่อ' } },
    {
      name: 'role',
      type: 'select',
      options: roles,
      required: true,
      defaultValue: roles.includes('editor') ? 'editor' : (roles[roles.length - 1] as string),
      access: adminOnly,
      label: { en: 'Role', th: 'บทบาท' },
    },
    {
      name: 'active',
      type: 'boolean',
      defaultValue: true,
      access: adminOnly,
      label: { en: 'Active', th: 'ใช้งาน' },
    },
    { name: 'passwordHash', type: 'text', hidden: true },
  ]
}

/**
 * Adds the built-in users collection, merging a user-supplied `users`
 * collection into it (extra fields appended, access and hooks overridden).
 */
export function withUsers(config: Config): Config {
  const roles = config.auth?.roles ?? DEFAULT_ROLES
  const custom = config.collections?.find((c) => c.slug === USERS)
  const users: CollectionConfig = {
    slug: USERS,
    labels: { singular: { en: 'User', th: 'ผู้ใช้' }, plural: { en: 'Users', th: 'ผู้ใช้' } },
    useAsTitle: 'email',
    ...custom,
    fields: [...userFields(roles), ...(custom?.fields ?? [])],
    access: {
      read: isLoggedIn,
      create: isAdmin,
      update: adminOrSelf,
      delete: isAdmin,
      ...custom?.access,
    },
  }
  const others = (config.collections ?? []).filter((c) => c.slug !== USERS)
  return { ...config, collections: [users, ...others] }
}

/** File metadata is set by uploads, never edited directly. */
const systemField = { update: () => false }

function mediaFields(): Field[] {
  return [
    {
      name: 'filename',
      type: 'text',
      required: true,
      unique: true,
      access: systemField,
      label: { en: 'File name', th: 'ชื่อไฟล์' },
    },
    {
      name: 'originalName',
      type: 'text',
      access: systemField,
      label: { en: 'Original name', th: 'ชื่อเดิม' },
    },
    {
      name: 'mimeType',
      type: 'text',
      required: true,
      access: systemField,
      label: { en: 'Type', th: 'ชนิด' },
    },
    {
      name: 'filesize',
      type: 'number',
      required: true,
      access: systemField,
      label: { en: 'Size (bytes)', th: 'ขนาด (ไบต์)' },
    },
    { name: 'width', type: 'number', access: systemField, label: { en: 'Width', th: 'กว้าง' } },
    { name: 'height', type: 'number', access: systemField, label: { en: 'Height', th: 'สูง' } },
    {
      name: 'sizes',
      type: 'json',
      access: systemField,
      label: { en: 'Resized copies', th: 'ขนาดย่อ' },
    },
    { name: 'alt', type: 'text', label: { en: 'Alternative text', th: 'ข้อความแทนรูป' } },
  ]
}

interface StoredSize {
  filename: string
  width?: number
  height?: number
}

/**
 * Adds the built-in media collection, merging a user-supplied `media`
 * collection into it like `withUsers`. Files are public; metadata is readable by anyone
 * so frontends can populate uploads, and writable by logged-in users.
 */
export function withMedia(config: Config): Config {
  const custom = config.collections?.find((c) => c.slug === MEDIA)
  const media: CollectionConfig = {
    slug: MEDIA,
    labels: { singular: { en: 'Media', th: 'สื่อ' }, plural: { en: 'Media', th: 'คลังสื่อ' } },
    useAsTitle: 'filename',
    ...custom,
    fields: [...mediaFields(), ...(custom?.fields ?? [])],
    access: {
      read: anyone,
      create: isLoggedIn,
      update: isLoggedIn,
      delete: isLoggedIn,
      ...custom?.access,
    },
    hooks: {
      ...custom?.hooks,
      afterRead: [
        ({ doc, cms }) => {
          const sizes = (doc.sizes ?? {}) as Record<string, StoredSize>
          return {
            ...doc,
            url: typeof doc.filename === 'string' ? cms.mediaURL(doc.filename) : null,
            sizes: Object.fromEntries(
              Object.entries(sizes).map(([name, size]) => [
                name,
                { ...size, url: cms.mediaURL(size.filename) },
              ]),
            ),
          }
        },
        ...(custom?.hooks?.afterRead ?? []),
      ],
      afterDelete: [
        async ({ doc, cms }) => {
          const sizes = Object.values((doc.sizes ?? {}) as Record<string, StoredSize>)
          for (const key of [doc.filename, ...sizes.map((s) => s.filename)]) {
            if (typeof key === 'string') await cms.storage.delete(key)
          }
        },
        ...(custom?.hooks?.afterDelete ?? []),
      ],
    },
  }
  const others = (config.collections ?? []).filter((c) => c.slug !== MEDIA)
  return { ...config, collections: [...others.slice(0, 1), media, ...others.slice(1)] }
}

const nobody: Access = () => false

/** Collections that back sessions and login rate limiting. */
export const internalCollections: readonly CollectionConfig[] = [
  {
    slug: SESSIONS,
    access: { read: nobody, create: nobody, update: nobody, delete: nobody },
    fields: [
      { name: 'tokenHash', type: 'text', required: true, unique: true },
      { name: 'user', type: 'relationship', to: USERS, required: true },
      { name: 'expiresAt', type: 'date', required: true, index: true },
    ],
  },
  {
    slug: LOGIN_ATTEMPTS,
    access: { read: nobody, create: nobody, update: nobody, delete: nobody },
    fields: [{ name: 'key', type: 'text', required: true, index: true }],
  },
]
