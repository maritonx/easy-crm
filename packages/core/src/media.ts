/** File types Easy CMS recognizes from their contents (FR-UPL-03). */
export const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'text/plain': 'txt',
}

const startsWith = (data: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((b, i) => data[offset + i] === b)
const ascii = (data: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...data.subarray(start, end))

/** Detects the MIME type from file contents, ignoring the name the client sent. */
export function sniffMimeType(data: Uint8Array): string | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(data, 0, 6) === 'GIF87a' || ascii(data, 0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(data, 4, 8) === 'ftyp') {
    const brand = ascii(data, 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) return 'video/mp4'
  }
  if (ascii(data, 0, 5) === '%PDF-') return 'application/pdf'

  // Text formats: must decode as UTF-8 without NUL bytes.
  const head = data.subarray(0, 4096)
  if (head.includes(0)) return undefined
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head)
  } catch {
    return undefined
  }
  const trimmed = text.replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(trimmed))
    return 'image/svg+xml'
  return 'text/plain'
}

/** `image/*` style matching. */
export function mimeAllowed(type: string, allowed: readonly string[]): boolean {
  return allowed.some((pattern) =>
    pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : pattern === type,
  )
}

/** Width and height of PNG, GIF, JPEG and WebP images without decoding them. */
export function imageDimensions(
  data: Uint8Array,
  type: string,
): { width: number; height: number } | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  try {
    switch (type) {
      case 'image/png':
        return { width: view.getUint32(16), height: view.getUint32(20) }
      case 'image/gif':
        return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
      case 'image/webp': {
        const chunk = ascii(data, 12, 16)
        if (chunk === 'VP8 ')
          return {
            width: view.getUint16(26, true) & 0x3fff,
            height: view.getUint16(28, true) & 0x3fff,
          }
        if (chunk === 'VP8L') {
          const bits = view.getUint32(21, true)
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
        }
        if (chunk === 'VP8X') {
          const w = view.getUint16(24, true) | (view.getUint8(26) << 16)
          const h = view.getUint16(27, true) | (view.getUint8(29) << 16)
          return { width: w + 1, height: h + 1 }
        }
        return undefined
      }
      case 'image/jpeg': {
        let offset = 2
        while (offset + 9 < data.length) {
          if (data[offset] !== 0xff) return undefined
          const marker = data[offset + 1] as number
          const length = view.getUint16(offset + 2)
          // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC)
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
          }
          offset += 2 + length
        }
        return undefined
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** A safe, unique storage key: `hello-world-3f9a2c1b.png`. */
export function storageKey(originalName: string, type: string, random: string): string {
  // Only the file name counts: clients may send paths like "C:\\photos\\a.png" or "../a.png".
  const name = originalName.split(/[\\/]/).pop() ?? ''
  const base =
    name
      .replace(/(?<=.)\.[^.]*$/, '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  return `${base}-${random}.${EXTENSIONS[type] ?? 'bin'}`
}
