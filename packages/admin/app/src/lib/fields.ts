import type { AdminCollection, AdminField } from '@easy-cms/core'

type Data = Record<string, unknown>

/** Initial form values for a new document: defaults, empty arrays, nested groups. */
export function initialValues(fields: readonly AdminField[]): Data {
  const data: Data = {}
  for (const field of fields) {
    if (field.type === 'group') data[field.name] = initialValues(field.fields ?? [])
    else if (field.type === 'array') data[field.name] = []
    else if (field.defaultValue !== undefined)
      data[field.name] = structuredClone(field.defaultValue)
    else if ((field.type === 'select' || field.type === 'relationship') && field.hasMany)
      data[field.name] = []
    else data[field.name] = field.type === 'boolean' ? false : null
  }
  return data
}

/**
 * Converts a loaded document into form values: keeps only known fields,
 * turns populated relationships back into ids and fills missing groups.
 */
export function toFormValues(fields: readonly AdminField[], doc: Data): Data {
  const data: Data = {}
  for (const field of fields) {
    const value = doc[field.name]
    if (field.type === 'group') {
      data[field.name] = toFormValues(field.fields ?? [], (value as Data) ?? {})
    } else if (field.type === 'array') {
      data[field.name] = Array.isArray(value)
        ? value.map((row) => ({
            id: (row as Data).id,
            ...toFormValues(field.fields ?? [], row as Data),
          }))
        : []
    } else if (field.type === 'relationship' || field.type === 'upload') {
      const toId = (v: unknown) => (v && typeof v === 'object' ? (v as Data).id : v)
      data[field.name] = Array.isArray(value) ? value.map(toId) : (toId(value) ?? null)
    } else {
      data[field.name] = value ?? (field.type === 'boolean' ? false : field.hasMany ? [] : null)
    }
  }
  return data
}

/** ISO string → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: unknown): string {
  if (typeof iso !== 'string' || iso === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** <input type="datetime-local"> value → ISO string (or null when empty). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The text shown for a document in lists and pickers. */
export function titleOf(collection: AdminCollection | undefined, doc: Data): string {
  const field = collection?.useAsTitle
  const value = field ? doc[field] : undefined
  return value !== undefined && value !== null && value !== ''
    ? String(value)
    : `#${String(doc.id)}`
}

/** Errors for a path and everything below it, e.g. "links" matches "links.0.url". */
export function errorsUnder(errors: Record<string, string[]>, path: string): number {
  return Object.keys(errors).filter((key) => key === path || key.startsWith(`${path}.`)).length
}

/** Stable JSON for dirty checking. */
export function snapshot(value: unknown): string {
  return JSON.stringify(value)
}
