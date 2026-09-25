import { type Access, isAdmin, isLoggedIn } from './access.js'
import type { CollectionConfig, Config } from './config.js'
import type { Field } from './fields.js'

export const USERS = 'users'
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
