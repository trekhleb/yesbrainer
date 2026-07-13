/**
 * RFC 4122 v4 UUID that also works in *insecure* contexts.
 *
 * `crypto.randomUUID()` only exists in a secure context (HTTPS or `localhost`),
 * so it's `undefined` when the app is served over plain HTTP — e.g. opening the
 * dev server from a phone at `http://192.168.x.x:5173`. Calling it there throws
 * a `TypeError`, and because we mint IDs during render (seat drafts, turn IDs),
 * that blanks the whole app. `crypto.getRandomValues()` *is* available in
 * insecure contexts, so we fall back to it, then to `Math.random()` as a final
 * safety net. In production (HTTPS) this is just `crypto.randomUUID()`.
 */
export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()

  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  // Pin the version (4) and variant (10xx) bits per RFC 4122 §4.4.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}
