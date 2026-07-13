import { describe, expect, it, vi } from 'vitest'
import { db } from '@/storage/db'
import { wipeAllCouncils, wipeAllStorage, wipeApiKeys } from '@/storage/wipe'
import { getApiKeys, setApiKeys } from '@/storage/keys'
import {
  ensurePersistedStorage,
  estimateStorage,
  isStoragePersisted,
  resetPersistDeniedReportedForTests,
} from '@/storage/persist'
import { analytics } from '@/analytics'

describe('wipeAllStorage', () => {
  it('drops the database and every yesbrainer:* key, sparing other origins’ keys', async () => {
    await db.councils.put({
      id: 'c1',
      title: null,
      createdAt: 1,
      socialStructure: 'roundtable',
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
    })
    localStorage.setItem('yesbrainer:keys', '{"anthropic":"k"}')
    localStorage.setItem('yesbrainer:demos-seeded', '1')
    localStorage.setItem('some-other-app', 'keep me')

    await wipeAllStorage()

    expect(localStorage.getItem('yesbrainer:keys')).toBeNull()
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBeNull()
    expect(localStorage.getItem('some-other-app')).toBe('keep me')
    // The database was deleted; reopening sees a clean slate.
    await db.open()
    expect(await db.councils.count()).toBe(0)
  })
})

describe('wipeAllCouncils', () => {
  it('drops every council/seat/turn but spares keys and the demos flag', async () => {
    await db.councils.put({
      id: 'c1',
      title: null,
      createdAt: 1,
      socialStructure: 'roundtable',
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
    })
    await db.seats.put({ id: 's1', councilId: 'c1', modelId: 'm', config: {} })
    await db.turns.put({
      id: 't1',
      councilId: 'c1',
      idx: 0,
      userMsg: 'hi',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
    })
    localStorage.setItem('yesbrainer:keys', '{"anthropic":"k"}')
    localStorage.setItem('yesbrainer:demos-seeded', '1')

    await wipeAllCouncils()

    expect(await db.councils.count()).toBe(0)
    expect(await db.seats.count()).toBe(0)
    expect(await db.turns.count()).toBe(0)
    // Everything else on the device is untouched — including the seeded
    // flag, so the demos don't re-appear (same as deleting all by hand).
    expect(localStorage.getItem('yesbrainer:keys')).toBe('{"anthropic":"k"}')
    expect(localStorage.getItem('yesbrainer:demos-seeded')).toBe('1')
  })
})

describe('wipeApiKeys', () => {
  it('clears every key without touching councils', async () => {
    await db.councils.put({
      id: 'keep-me',
      title: null,
      createdAt: 1,
      socialStructure: 'roundtable',
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
    })
    setApiKeys({ anthropic: 'sk-live', openai: 'sk-other' })

    wipeApiKeys()

    expect(getApiKeys()).toEqual({})
    expect(await db.councils.count()).toBe(1)
  })
})

describe('persist helpers', () => {
  it('degrade to false/null when the Storage API is missing', async () => {
    // jsdom has no navigator.storage — this IS the missing-API branch.
    expect(await ensurePersistedStorage()).toBe(false)
    expect(await isStoragePersisted()).toBe(false)
    expect(await estimateStorage()).toBeNull()
  })

  it('short-circuits when already persistent and requests when not', async () => {
    const persisted = vi.fn().mockResolvedValue(true)
    const persist = vi.fn()
    vi.stubGlobal('navigator', {
      storage: { persisted, persist },
    })
    expect(await ensurePersistedStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()

    persisted.mockResolvedValue(false)
    persist.mockResolvedValue(true)
    expect(await ensurePersistedStorage()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()

    vi.unstubAllGlobals()
  })

  it('reports the persist outcome — but a denial only once per page load', async () => {
    // Settings auto-saves per keystroke and re-asks persist() each time; an
    // unguarded denied event would fire per keystroke for unpersisted users.
    resetPersistDeniedReportedForTests()
    const eventSpy = vi.spyOn(analytics, 'event')
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('navigator', { storage: { persisted, persist } })

    expect(await ensurePersistedStorage()).toBe(false)
    expect(await ensurePersistedStorage()).toBe(false)
    expect(eventSpy).toHaveBeenCalledTimes(1)
    expect(eventSpy).toHaveBeenCalledWith('storage-persist-denied')

    // A later grant (user retries via the Settings button) still reports.
    persist.mockResolvedValue(true)
    expect(await ensurePersistedStorage()).toBe(true)
    expect(eventSpy).toHaveBeenCalledWith('storage-persist-granted')

    vi.unstubAllGlobals()
    eventSpy.mockRestore()
  })

  it('reports usage/quota with zero fallbacks', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockResolvedValue({ usage: 42 }) },
    })
    expect(await estimateStorage()).toEqual({ usage: 42, quota: 0 })
    vi.unstubAllGlobals()
  })

  it('isStoragePersisted reflects the persisted() result', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: vi.fn().mockResolvedValue(true) },
    })
    expect(await isStoragePersisted()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('swallows a rejecting storage API into false / null, logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('navigator', {
      storage: {
        persist: vi.fn().mockRejectedValue(new Error('denied')),
        persisted: vi.fn().mockResolvedValue(false),
        estimate: vi.fn().mockRejectedValue(new Error('nope')),
      },
    })
    expect(await ensurePersistedStorage()).toBe(false)
    expect(await estimateStorage()).toBeNull()
    expect(warn).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
