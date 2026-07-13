import { afterEach, describe, expect, it, vi } from 'vitest'
import { uuid } from '@/utils/uuid'

const V4_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uuid', () => {
  it('produces RFC 4122 v4 ids', () => {
    expect(uuid()).toMatch(V4_SHAPE)
    expect(uuid()).not.toBe(uuid())
  })

  it('still works in an insecure context (no crypto.randomUUID)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: real.getRandomValues.bind(real),
    })
    expect(uuid()).toMatch(V4_SHAPE)
  })

  it('survives even with no crypto at all (final safety net)', () => {
    vi.stubGlobal('crypto', undefined)
    expect(uuid()).toMatch(V4_SHAPE)
  })
})
