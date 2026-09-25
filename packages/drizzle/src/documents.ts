import type { ID, RawDocument } from '@easy-cms/core'
import { asc, eq, inArray } from 'drizzle-orm'
import type { AnyColumn, DrizzleDb } from './dialect.js'
import type { ChildModel, TableModel } from './schema.js'

type Data = Record<string, unknown>
type Row = Record<string, unknown>
/** The database or an open transaction. */
type Executor = DrizzleDb

const col = (model: TableModel, name: string) => model.table[name] as AnyColumn

function getAt(data: Data, path: readonly string[]): unknown {
  let current: unknown = data
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Data)[key]
  }
  return current
}

function setAt(data: Data, path: readonly string[], value: unknown) {
  let current = data
  for (const key of path.slice(0, -1)) {
    if (typeof current[key] !== 'object' || current[key] === null) current[key] = {}
    current = current[key] as Data
  }
  current[path[path.length - 1] as string] = value
}

/** Converts a database row into document data (groups nested, children empty). */
function rowToData(model: TableModel, row: Row): Data {
  const data: Data = {}
  for (const column of model.columns) setAt(data, column.path, row[column.column] ?? null)
  for (const child of model.children) setAt(data, child.path, [])
  return data
}

function dataToRow(model: TableModel, data: Data): Row {
  const row: Row = {}
  for (const column of model.columns) row[column.column] = getAt(data, column.path) ?? null
  return row
}

const CHUNK = 500

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

/** Loads array rows and hasMany values for the given rows and attaches them. */
async function attachChildren(db: Executor, model: TableModel, rows: Row[], docs: Data[]) {
  if (model.children.length === 0 || rows.length === 0) return
  const ids = rows.map((r) => r.id as ID)
  const indexById = new Map(ids.map((id, i) => [id, i]))

  for (const child of model.children) {
    const childRows: Row[] = []
    for (const part of chunks(ids)) {
      childRows.push(
        ...((await db
          .select()
          .from(child.table.table)
          .where(inArray(col(child.table, '_parent_id'), part))
          .orderBy(asc(col(child.table, '_order')))) as Row[]),
      )
    }
    const childDocs = child.kind === 'array' ? await hydrate(db, child.table, childRows) : undefined

    childRows.forEach((childRow, i) => {
      const index = indexById.get(childRow._parent_id as ID)
      if (index === undefined) return
      const list = getAt(docs[index] as Data, child.path) as unknown[]
      list.push(child.kind === 'array' ? { id: childRow.id, ...childDocs?.[i] } : childRow.value)
    })
  }
}

/** Turns rows of a table into documents, including every child table below it. */
export async function hydrate(db: Executor, model: TableModel, rows: Row[]): Promise<Data[]> {
  const docs = rows.map((row) => rowToData(model, row))
  await attachChildren(db, model, rows, docs)
  return docs
}

export function toDocument(row: Row, data: Data, drafts: boolean): RawDocument {
  return {
    id: row.id as ID,
    ...data,
    ...(drafts ? { status: row.status } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function insertChildren(db: Executor, model: TableModel, parentId: ID, data: Data) {
  for (const child of model.children) {
    const value = getAt(data, child.path)
    if (!Array.isArray(value) || value.length === 0) continue
    await insertChild(db, child, parentId, value)
  }
}

async function insertChild(db: Executor, child: ChildModel, parentId: ID, items: unknown[]) {
  if (child.kind === 'values') {
    const rows = items.map((value, i) => ({ _parent_id: parentId, _order: i, value }))
    for (const part of chunks(rows)) await db.insert(child.table.table).values(part)
    return
  }
  for (const [i, item] of items.entries()) {
    const rowData = item as Data
    const id = rowData.id as string
    await db
      .insert(child.table.table)
      .values({ ...dataToRow(child.table, rowData), id, _parent_id: parentId, _order: i })
    await insertChildren(db, child.table, id, rowData)
  }
}

/** Deletes every child row below the given parents, deepest first. */
async function deleteChildren(db: Executor, model: TableModel, parentIds: readonly ID[]) {
  if (parentIds.length === 0) return
  for (const child of model.children) {
    for (const part of chunks(parentIds)) {
      const parentCol = col(child.table, '_parent_id')
      if (child.table.children.length > 0) {
        const rows = (await db
          .select({ id: col(child.table, 'id') })
          .from(child.table.table)
          .where(inArray(parentCol, part))) as Row[]
        await deleteChildren(
          db,
          child.table,
          rows.map((r) => r.id as ID),
        )
      }
      await db.delete(child.table.table).where(inArray(parentCol, part))
    }
  }
}

export interface SystemValues {
  readonly createdAt: unknown
  readonly updatedAt: unknown
  readonly status?: unknown
}

function systemRow(values: SystemValues, drafts: boolean): Row {
  return {
    created_at: values.createdAt,
    updated_at: values.updatedAt,
    ...(drafts ? { status: values.status ?? 'draft' } : {}),
  }
}

export async function insertDocument(
  db: Executor,
  model: TableModel,
  data: Data,
  drafts: boolean,
): Promise<ID> {
  const [inserted] = (await db
    .insert(model.table)
    .values({ ...dataToRow(model, data), ...systemRow(data as unknown as SystemValues, drafts) })
    .returning({ id: col(model, 'id') })) as Row[]
  const id = inserted?.id as ID
  await insertChildren(db, model, id, data)
  return id
}

export async function replaceDocument(
  db: Executor,
  model: TableModel,
  id: ID,
  data: Data,
  drafts: boolean,
) {
  await db
    .update(model.table)
    .set({ ...dataToRow(model, data), ...systemRow(data as unknown as SystemValues, drafts) })
    .where(eq(col(model, 'id'), id))
  await deleteChildren(db, model, [id])
  await insertChildren(db, model, id, data)
}

export async function deleteDocument(db: Executor, model: TableModel, id: ID) {
  await deleteChildren(db, model, [id])
  await db.delete(model.table).where(eq(col(model, 'id'), id))
}
