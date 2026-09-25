import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { imageDimensions, localStorage, mimeAllowed, sniffMimeType } from '../src/index.js'
import { storageKey } from '../src/media.js'

const image = async (format: 'png' | 'jpeg' | 'webp' | 'gif' | 'avif', width = 37, height = 21) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: 'red' } })
      [format]()
      .toBuffer(),
  )
const text = (value: string) => new TextEncoder().encode(value)

describe('sniffMimeType', () => {
  it.each(['png', 'jpeg', 'webp', 'gif', 'avif'] as const)(
    'detects %s from its bytes',
    async (format) => {
      expect(sniffMimeType(await image(format))).toBe(`image/${format}`)
    },
  )

  it('detects PDF, SVG and plain text; rejects binary junk', () => {
    expect(sniffMimeType(text('%PDF-1.7\n...'))).toBe('application/pdf')
    expect(sniffMimeType(text('<?xml version="1.0"?>\n<!-- c --><svg xmlns="x"></svg>'))).toBe(
      'image/svg+xml',
    )
    expect(sniffMimeType(text('﻿  <svg width="1">'))).toBe('image/svg+xml')
    expect(sniffMimeType(text('<html><svg></svg></html>'))).toBe('text/plain')
    expect(sniffMimeType(text('สวัสดี'))).toBe('text/plain')
    expect(sniffMimeType(new Uint8Array([0, 1, 2, 3, 255]))).toBeUndefined()
  })
})

describe('imageDimensions', () => {
  it.each(['png', 'jpeg', 'webp', 'gif'] as const)(
    'reads %s dimensions without decoding',
    async (format) => {
      const data = await image(format)
      expect(imageDimensions(data, `image/${format}`)).toEqual({ width: 37, height: 21 })
    },
  )

  it('handles lossless and extended WebP', async () => {
    const lossless = new Uint8Array(
      await sharp({ create: { width: 300, height: 5, channels: 4, background: 'red' } })
        .webp({ lossless: true })
        .toBuffer(),
    )
    expect(imageDimensions(lossless, 'image/webp')).toEqual({ width: 300, height: 5 })
  })

  it('returns undefined for truncated data', () => {
    expect(imageDimensions(new Uint8Array([0x89, 0x50]), 'image/png')).toBeUndefined()
    expect(imageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeUndefined()
  })
})

describe('mimeAllowed', () => {
  it('matches exact types and wildcards', () => {
    expect(mimeAllowed('image/png', ['image/*'])).toBe(true)
    expect(mimeAllowed('application/pdf', ['image/*', 'application/pdf'])).toBe(true)
    expect(mimeAllowed('text/plain', ['image/*', 'application/pdf'])).toBe(false)
  })
})

describe('storageKey', () => {
  it('keeps readable names in any script and uses the detected extension', () => {
    expect(storageKey('My Photo (1).JPG', 'image/png', 'abcd1234')).toBe('my-photo-1-abcd1234.png')
    expect(storageKey('รูปภาพ สวย.png', 'image/png', 'abcd1234')).toBe('รูปภาพ-สวย-abcd1234.png')
    expect(storageKey('../../etc/passwd', 'text/plain', 'abcd1234')).toBe('passwd-abcd1234.txt')
    expect(storageKey('C:\\photos\\cat.jpeg', 'image/jpeg', 'abcd1234')).toBe('cat-abcd1234.jpg')
    expect(storageKey('.env', 'text/plain', 'abcd1234')).toBe('env-abcd1234.txt')
    expect(storageKey('...', 'image/gif', 'abcd1234')).toBe('file-abcd1234.gif')
  })
})

describe('localStorage', () => {
  it('writes, reads and deletes inside its directory only', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-storage-'))
    const storage = localStorage({ dir: 'files' })
    storage.init?.({ cwd })
    await storage.put('a-1.txt', text('hello'), { contentType: 'text/plain' })
    expect(readdirSync(join(cwd, 'files'))).toEqual(['a-1.txt'])
    expect(new TextDecoder().decode((await storage.get('a-1.txt'))?.body)).toBe('hello')
    await expect(
      storage.put('a-1.txt', text('again'), { contentType: 'text/plain' }),
    ).rejects.toThrow()
    await expect(storage.get('../escape.txt')).rejects.toThrow('Invalid storage key')
    await storage.delete('a-1.txt')
    expect(await storage.get('a-1.txt')).toBeNull()
  })
})
