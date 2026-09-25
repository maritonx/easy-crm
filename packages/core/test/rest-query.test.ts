import { describe, expect, it } from 'vitest'
import { QueryError } from '../src/index.js'
import { parseListQuery, parseNested } from '../src/rest/query.js'

const url = (q: string) => new URL(`http://x.test/api?${q}`)

describe('parseNested', () => {
  it('builds nested objects and arrays from brackets', () => {
    expect(parseNested(new URLSearchParams('a[b][c]=1&a[list][0]=x&a[list][1]=y&plain=z'))).toEqual(
      {
        a: { b: { c: '1' }, list: ['x', 'y'] },
        plain: 'z',
      },
    )
  })

  it('rejects prototype keys, huge indexes, deep nesting and conflicts', () => {
    for (const q of [
      'a[__proto__][x]=1',
      'constructor=1',
      'a[101]=1',
      `a${'[b]'.repeat(10)}=1`,
      'a=1&a[b]=2',
      'a]b=1',
    ]) {
      expect(() => parseNested(new URLSearchParams(q)), q).toThrow(QueryError)
    }
  })
})

describe('parseListQuery', () => {
  it('defaults limit and page', () => {
    expect(parseListQuery(url(''))).toEqual({ limit: 10, page: 1 })
  })

  it('reads where, sort, limit, page and depth', () => {
    expect(
      parseListQuery(url('where[title][equals]=x&sort=-views,title&limit=5&page=2&depth=0')),
    ).toEqual({
      where: { title: { equals: 'x' } },
      sort: ['-views', 'title'],
      limit: 5,
      page: 2,
      depth: 0,
    })
  })

  it('converts operator values from strings', () => {
    const { where } = parseListQuery(
      url(
        'where[a][exists]=false&where[b][in]=1,2&where[c][equals]=null&where[d][not_in]=&where[e][exists]=true',
      ),
    )
    expect(where).toEqual({
      a: { exists: false },
      b: { in: ['1', '2'] },
      c: { equals: null },
      d: { not_in: [] },
      e: { exists: true },
    })
  })

  it('accepts where as JSON', () => {
    expect(
      parseListQuery(url(`where=${encodeURIComponent('{"or":[{"a":{"equals":1}}]}')}`)).where,
    ).toEqual({
      or: [{ a: { equals: 1 } }],
    })
  })

  it('rejects out-of-range numbers', () => {
    for (const q of [
      'limit=0',
      'limit=101',
      'limit=abc',
      'page=0',
      'depth=4',
      'depth=-1',
      'where=[1]',
    ]) {
      expect(() => parseListQuery(url(q)), q).toThrow(QueryError)
    }
  })
})
