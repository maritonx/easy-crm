import { describe, expect, it } from 'vitest'
import {
  applyDefaults,
  type Field,
  fillMissing,
  generateSlugs,
  mergeForUpdate,
  parseId,
  slugify,
  validateFields,
} from '../src/index.js'

describe('slugify', () => {
  it.each([
    ['Hello, World!', 'hello-world'],
    ['  --Trim me--  ', 'trim-me'],
    ['สวัสดี ชาวโลก', 'สวัสดี-ชาวโลก'],
    ['Café crème', 'café-crème'],
    ['ＦＵＬＬ　ｗｉｄｔｈ', 'full-width'],
    ['!!!', ''],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe('parseId', () => {
  it('accepts positive integers and integer strings only', () => {
    expect(parseId(5)).toBe(5)
    expect(parseId('42')).toBe(42)
    for (const bad of [0, -1, 1.5, '0', '01', 'abc', '', null, undefined, {}])
      expect(parseId(bad)).toBeUndefined()
  })
})

const fields: Field[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'slug', type: 'slug', from: 'title' },
  { name: 'count', type: 'number', defaultValue: 1 },
  { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true, defaultValue: ['a'] },
  {
    name: 'seo',
    type: 'group',
    fields: [{ name: 'noIndex', type: 'boolean', defaultValue: false }],
  },
  { name: 'rows', type: 'array', fields: [{ name: 'n', type: 'number', defaultValue: 7 }] },
]

describe('applyDefaults', () => {
  it('fills missing values, recursing into groups and rows, without sharing references', () => {
    const data = applyDefaults(fields, { rows: [{}, { n: 2 }] })
    expect(data).toEqual({
      count: 1,
      tags: ['a'],
      seo: { noIndex: false },
      rows: [{ n: 7 }, { n: 2 }],
    })
    ;(data.tags as string[]).push('b')
    expect(fields[3]?.defaultValue).toEqual(['a'])
  })

  it('keeps explicit nulls', () => {
    expect(applyDefaults(fields, { count: null }).count).toBeNull()
  })
})

describe('fillMissing', () => {
  it('gives every field a value', () => {
    expect(fillMissing(fields, {})).toEqual({
      title: null,
      slug: null,
      count: null,
      tags: [],
      seo: { noIndex: null },
      rows: [],
    })
  })
})

describe('generateSlugs', () => {
  it('fills empty slugs from their source and normalizes given ones', () => {
    expect(generateSlugs(fields, { title: 'Hi There' }).slug).toBe('hi-there')
    expect(generateSlugs(fields, { title: 'Hi', slug: 'My Own' }).slug).toBe('my-own')
    expect(generateSlugs(fields, { title: '' }).slug).toBeUndefined()
  })
})

describe('mergeForUpdate', () => {
  it('merges groups key by key and replaces arrays', () => {
    const existing = {
      title: 'a',
      tags: ['a', 'b'],
      seo: { noIndex: true },
      rows: [{ n: 1 }, { n: 2 }],
    }
    expect(mergeForUpdate(fields, existing, { tags: ['b'], rows: [{ n: 3 }], seo: {} })).toEqual({
      title: 'a',
      slug: undefined,
      count: undefined,
      tags: ['b'],
      seo: { noIndex: true },
      rows: [{ n: 3 }],
    })
  })

  it('lets null clear a value', () => {
    expect(mergeForUpdate(fields, { title: 'a' }, { title: null }).title).toBeNull()
  })
})

describe('validateFields', () => {
  const validate = (data: Record<string, unknown>, list: Field[] = fields) =>
    validateFields(list, data, { operation: 'create', root: data })

  it('normalizes values and drops unknown keys', async () => {
    const result = await validate({ title: 'T', count: '3', extra: 'dropped', rows: [{ n: 1 }] })
    expect(result.errors).toEqual([])
    expect(result.data).toMatchObject({
      title: 'T',
      count: 3,
      tags: [],
      rows: [{ n: 1, id: expect.any(String) }],
    })
    expect(result.data).not.toHaveProperty('extra')
  })

  it('keeps row ids that are given', async () => {
    const result = await validate({ title: 'T', rows: [{ id: 'keep-me', n: 1 }] })
    expect((result.data.rows as { id: string }[])[0]?.id).toBe('keep-me')
  })

  it('treats empty strings and empty arrays as missing', async () => {
    const result = await validate({ title: '' }, [
      { name: 'title', type: 'text', required: true },
      { name: 'tags', type: 'select', options: ['a'], hasMany: true, required: true },
    ])
    expect(result.errors.map((e) => e.field)).toEqual(['title', 'tags'])
  })

  it('checks each type', async () => {
    const list: Field[] = [
      { name: 'email', type: 'email' },
      { name: 'flag', type: 'boolean' },
      { name: 'when', type: 'date' },
      { name: 'doc', type: 'richText' },
      { name: 'ref', type: 'relationship', to: 'x' },
      { name: 'refs', type: 'relationship', to: 'x', hasMany: true },
      { name: 'short', type: 'text', maxLength: 2 },
      { name: 'rows', type: 'array', maxRows: 1, fields: [{ name: 'a', type: 'text' }] },
    ]
    const result = await validate(
      {
        email: 'nope',
        flag: 'yes',
        when: 'soon',
        doc: { type: 'p' },
        ref: 'abc',
        refs: 1,
        short: 'abc',
        rows: [{}, {}],
      },
      list,
    )
    expect(result.errors.map((e) => e.field)).toEqual([
      'email',
      'flag',
      'when',
      'doc',
      'ref',
      'refs',
      'short',
      'rows',
    ])
  })

  it('collects references to check against the database', async () => {
    const list: Field[] = [
      { name: 'ref', type: 'relationship', to: 'posts' },
      { name: 'cover', type: 'upload' },
      {
        name: 'rows',
        type: 'array',
        fields: [{ name: 'refs', type: 'relationship', to: 'tags', hasMany: true }],
      },
    ]
    const result = await validate({ ref: '3', cover: { id: 9 }, rows: [{ refs: [1, 2] }] }, list)
    expect(result.data).toMatchObject({ ref: 3, cover: 9 })
    expect(result.references).toEqual([
      { field: 'ref', collection: 'posts', id: 3 },
      { field: 'cover', collection: 'media', id: 9 },
      { field: 'rows.0.refs', collection: 'tags', id: 1 },
      { field: 'rows.0.refs', collection: 'tags', id: 2 },
    ])
  })
})
