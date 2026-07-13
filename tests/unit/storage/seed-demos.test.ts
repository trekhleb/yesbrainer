import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/storage/db'
import { clearDb } from '../helpers/db'
import { seat } from '../helpers/fixtures'

/**
 * `seedDemoCouncilsIfNeeded` memoizes its in-flight promise at module
 * level (StrictMode dedupe), so each scenario re-imports a fresh module
 * registry.
 */
async function freshSeeder() {
  vi.resetModules()
  const mod = await import('@/storage/seed-demos')
  return mod.seedDemoCouncilsIfNeeded
}

beforeEach(async () => {
  await clearDb()
})

afterEach(() => {
  // Drop any per-test module mock so the next `freshSeeder` sees the real one.
  vi.doUnmock('@/storage/transfer')
})

describe('seedDemoCouncilsIfNeeded', () => {
  it('seeds a pristine profile once through the real import path', async () => {
    const seed = await freshSeeder()
    const seeded = await seed()
    expect(seeded).toBe(true)
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBe('1')
    expect(await db.councils.count()).toBeGreaterThan(0)
    // Every demo rode the zod-validated import (isDemo marks them).
    const rows = await db.councils.toArray()
    expect(rows.every((r) => r.isDemo)).toBe(true)

    // StrictMode double-fire: the same call is memoized.
    expect(await seed()).toBe(true)
  })

  it('never seeds over an existing user, and flags so demos stay gone', async () => {
    const { createCouncil } = await import('@/storage/councils')
    await createCouncil({
      id: 'mine',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const seed = await freshSeeder()
    expect(await seed()).toBe(false)
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBe('1')
    expect(await db.councils.count()).toBe(1)
  })

  it('respects the one-shot flag (deleting demos is permanent)', async () => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
    const seed = await freshSeeder()
    expect(await seed()).toBe(false)
    expect(await db.councils.count()).toBe(0)
  })

  it('skips seeding when localStorage is unavailable (exotic embedder)', async () => {
    vi.resetModules()
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage blocked')
      })
    const { seedDemoCouncilsIfNeeded } = await import('@/storage/seed-demos')
    expect(await seedDemoCouncilsIfNeeded()).toBe(false)
    getItem.mockRestore()
  })

  it('logs (never throws) when the demo bundle reports validation errors', async () => {
    vi.resetModules()
    vi.doMock('@/storage/transfer', () => ({
      importCouncils: vi.fn(async () => ({ imported: 2, errors: ['bad demo'] })),
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { seedDemoCouncilsIfNeeded } = await import('@/storage/seed-demos')
    expect(await seedDemoCouncilsIfNeeded()).toBe(true)
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBe('1')
    expect(errSpy).toHaveBeenCalledWith('demo seed errors:', ['bad demo'])
  })

  it('boots demo-less when seeding throws — logs, leaves the flag unset', async () => {
    vi.resetModules()
    vi.doMock('@/storage/transfer', () => ({
      importCouncils: vi.fn(async () => {
        throw new Error('chunk fetch failed')
      }),
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { seedDemoCouncilsIfNeeded } = await import('@/storage/seed-demos')
    expect(await seedDemoCouncilsIfNeeded()).toBe(false)
    // Flag stays unset so the next healthy load retries.
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBeNull()
    expect(errSpy).toHaveBeenCalledWith('demo seed skipped:', expect.any(Error))
  })
})
