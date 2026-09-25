import type { AdminField } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { toQuery } from '../app/src/lib/api'
import {
  errorsUnder,
  fromLocalInput,
  initialValues,
  titleOf,
  toFormValues,
  toLocalInput,
} from '../app/src/lib/fields'
import { humanize, label, setLocale, singularize, t } from '../app/src/lib/i18n'

const fields: AdminField[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'count', type: 'number', defaultValue: 3 },
  { name: 'flag', type: 'boolean' },
  { name: 'tags', type: 'select', hasMany: true, options: [{ label: 'A', value: 'a' }] },
  { name: 'author', type: 'relationship', to: 'users' },
  { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
  { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
  { name: 'rows', type: 'array', fields: [{ name: 'x', type: 'text' }] },
]

describe('form values', () => {
  it('builds initial values with defaults and empty containers', () => {
    expect(initialValues(fields)).toEqual({
      title: null,
      count: 3,
      flag: false,
      tags: [],
      author: null,
      related: [],
      seo: { title: null },
      rows: [],
    })
  })

  it('turns populated documents into form values and drops unknown keys', () => {
    const values = toFormValues(fields, {
      id: 1,
      createdAt: 'x',
      title: 'T',
      author: { id: 7, email: 'a@b.co' },
      related: [{ id: 2 }, 3],
      rows: [{ id: 'r1', x: 'y', extra: true }],
    })
    expect(values).toEqual({
      title: 'T',
      count: null,
      flag: false,
      tags: [],
      author: 7,
      related: [2, 3],
      seo: { title: null },
      rows: [{ id: 'r1', x: 'y' }],
    })
  })

  it('converts between ISO and datetime-local in local time', () => {
    const iso = '2026-01-02T03:04:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
  })

  it('counts errors under a path', () => {
    expect(errorsUnder({ rows: ['x'], 'rows.0.x': ['y'], rowsOther: ['z'] }, 'rows')).toBe(2)
  })

  it('titles documents by useAsTitle or id', () => {
    const collection = {
      slug: 'p',
      drafts: false,
      fields: [],
      useAsTitle: 'title',
      permissions: { read: true, create: true, update: true, delete: true },
    }
    expect(titleOf(collection, { id: 1, title: 'Hi' })).toBe('Hi')
    expect(titleOf(collection, { id: 1, title: '' })).toBe('#1')
    expect(titleOf(undefined, { id: 5 })).toBe('#5')
  })
})

describe('toQuery', () => {
  it('builds bracket parameters and skips empty values', () => {
    expect(
      toQuery({
        where: { title: { like: 'a b' }, id: { in: [1, 2] } },
        limit: 10,
        q: '',
        x: undefined,
      }),
    ).toBe(
      '?where[title][like]=a%20b&where[id][in][0]=1&where[id][in][1]=2&limit=10'
        .replace(/\[/g, '%5B')
        .replace(/\]/g, '%5D'),
    )
    expect(toQuery({})).toBe('')
  })
})

describe('i18n', () => {
  it('translates with parameters and switches language', () => {
    setLocale('en')
    expect(t('list.selected', { count: 3 })).toBe('3 selected')
    setLocale('th')
    expect(t('list.selected', { count: 3 })).toBe('เลือกแล้ว 3 รายการ')
    expect(document.documentElement.lang).toBe('th')
    setLocale('en')
  })

  it('resolves labels per locale with fallbacks', () => {
    setLocale('th')
    expect(label({ en: 'Title', th: 'ชื่อเรื่อง' }, 'title')).toBe('ชื่อเรื่อง')
    expect(label({ en: 'Only English' }, 'x')).toBe('Only English')
    setLocale('en')
    expect(label('Plain', 'x')).toBe('Plain')
    expect(label(undefined, 'publishedAt')).toBe('Published at')
  })

  it('humanizes and singularizes slugs', () => {
    expect(humanize('site-settings')).toBe('Site settings')
    expect(['posts', 'categories', 'users', 'boxes', 'status', 'news'].map(singularize)).toEqual([
      'post',
      'category',
      'user',
      'box',
      'status',
      'new',
    ])
  })
})
