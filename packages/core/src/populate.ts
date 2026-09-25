import type { ID } from './access.js'
import type { CollectionConfig } from './config.js'
import type { Database, RawDocument } from './database.js'
import type { Field } from './fields.js'

type Data = Record<string, unknown>

export const DEFAULT_DEPTH = 1
export const MAX_DEPTH = 3

interface Slot {
  /** Collection the ids point to. */
  readonly collection: string
  readonly ids: ID[]
  /** Writes the populated documents back into place. */
  readonly assign: (byId: ReadonlyMap<ID, RawDocument>) => void
}

/**
 * Replaces relationship and upload ids with documents, `depth` levels deep.
 * Missing documents become `null` (single) or are dropped (hasMany).
 * Returns new objects; the input is not modified.
 */
export async function populate(
  db: Database,
  collections: readonly CollectionConfig[],
  fields: readonly Field[],
  docs: RawDocument[],
  depth: number,
): Promise<RawDocument[]> {
  if (depth <= 0 || docs.length === 0) return docs
  const bySlug = new Map(collections.map((c) => [c.slug, c]))
  const copies = docs.map((doc) => structuredClone(doc))

  const slots: Slot[] = []
  for (const doc of copies) collectSlots(fields, doc, bySlug, slots)
  if (slots.length === 0) return copies

  const wanted = new Map<string, Set<ID>>()
  for (const slot of slots) {
    const set = wanted.get(slot.collection) ?? new Set()
    for (const id of slot.ids) set.add(id)
    wanted.set(slot.collection, set)
  }

  const found = new Map<string, Map<ID, RawDocument>>()
  await Promise.all(
    [...wanted].map(async ([slug, ids]) => {
      const collection = bySlug.get(slug)
      if (!collection) return
      const raw = await db.findByIds({ collection: slug, ids: [...ids] })
      const populated = await populate(db, collections, collection.fields, raw, depth - 1)
      found.set(slug, new Map(populated.map((d) => [d.id, d])))
    }),
  )

  for (const slot of slots) slot.assign(found.get(slot.collection) ?? new Map())
  return copies
}

function collectSlots(
  fields: readonly Field[],
  data: Data,
  bySlug: ReadonlyMap<string, CollectionConfig>,
  slots: Slot[],
) {
  for (const field of fields) {
    const value = data[field.name]
    if (value === null || value === undefined) continue

    if (field.type === 'group') {
      if (typeof value === 'object') collectSlots(field.fields, value as Data, bySlug, slots)
    } else if (field.type === 'array') {
      if (Array.isArray(value))
        for (const row of value) collectSlots(field.fields, row as Data, bySlug, slots)
    } else if (field.type === 'relationship' || field.type === 'upload') {
      const collection = field.type === 'upload' ? 'media' : field.to
      if (!bySlug.has(collection)) continue // built-in collections are populated from M2/M5
      if (Array.isArray(value)) {
        const ids = value as ID[]
        slots.push({
          collection,
          ids,
          assign: (byId) => {
            data[field.name] = ids.map((id) => byId.get(id)).filter((d) => d !== undefined)
          },
        })
      } else {
        const id = value as ID
        slots.push({
          collection,
          ids: [id],
          assign: (byId) => {
            data[field.name] = byId.get(id) ?? null
          },
        })
      }
    }
  }
}
