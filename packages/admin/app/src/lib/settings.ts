export interface Settings {
  adminPath: string
  apiPath: string
  locale: 'en' | 'th'
}

/** Injected by the server as <meta name="easy-cms">. Falls back to defaults for `vite dev`. */
export function readSettings(): Settings {
  const defaults: Settings = { adminPath: '/admin', apiPath: '/api/cms', locale: 'en' }
  const content = document.querySelector('meta[name="easy-cms"]')?.getAttribute('content')
  if (!content) return defaults
  try {
    return { ...defaults, ...(JSON.parse(content) as Partial<Settings>) }
  } catch {
    return defaults
  }
}

export const settings = readSettings()
